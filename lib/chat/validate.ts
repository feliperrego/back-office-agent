import { safeValidateUIMessages, type ToolSet, type UIMessage } from "ai";
import { messageText } from "@/lib/trace/message-text";
import { MAX_USER_CHARS } from "./config";
import {
  MAX_APPROVAL_REASON_CHARS,
  MAX_ASSISTANT_CHARS,
  MAX_MESSAGES,
  MAX_TOOL_PART_CHARS,
  MAX_TOOL_PARTS,
} from "./limits";

// P2 changes this shell default on purpose (P2's spec §4.3, P2-20; template spec §5.8, X-02):
// the template kept assistant text only, so an approval never reached streamText. This version
// keeps the tool parts of the tools the route offers, field by field, with the step-start parts,
// in order. Listed for X-03; P2 owns lib/chat/validate.test.ts and the route tests it touches.

export type ValidateResult =
  { ok: true; messages: UIMessage[] } | { ok: false; status: 400; text: string };

/** Plain-text bodies of the 400 responses. Honest clients never see them. */
export const VALIDATION_ERRORS = {
  shape: "Invalid request: expected a JSON body with a non-empty messages array of UI messages.",
  role: "Invalid request: only user and assistant messages are allowed.",
  userPart: "Invalid request: user messages may contain text parts only.",
  tooMany: `Invalid request: a conversation may have at most ${MAX_MESSAGES} messages.`,
  userTooLong: `Invalid request: a user message may have at most ${MAX_USER_CHARS} characters.`,
  toolParts: `Invalid request: an assistant message may hold at most ${MAX_TOOL_PARTS} tool calls.`,
  toolPartTooLong: `Invalid request: a tool call's input, output and error may have at most ${MAX_TOOL_PART_CHARS} characters.`,
  approvalReason: `Invalid request: an approval's reason may have at most ${MAX_APPROVAL_REASON_CHARS} characters.`,
  toolInput: "Invalid request: a tool call's input does not match its tool.",
  noUser: "Invalid request: the conversation needs at least one user message.",
} as const;

function reject(text: string): ValidateResult {
  return { ok: false, status: 400, text };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type Part = UIMessage["parts"][number];

/** A tool part as the SDK's shape check leaves it: any tool, any state. */
type RawToolPart = {
  type: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  rawInput?: unknown;
  output?: unknown;
  errorText?: string;
  preliminary?: boolean;
  approval?: { id: string; approved?: boolean; reason?: string; isAutomatic?: boolean };
};

function isToolPart(part: Part): boolean {
  return part.type.startsWith("tool-") || part.type === "dynamic-tool";
}

/** A tool part's input, output and error as JSON: what MAX_TOOL_PART_CHARS bounds. */
function toolPartSize(part: RawToolPart): number {
  const { input, rawInput, output, errorText } = part;
  return JSON.stringify({ input, rawInput, output, errorText }).length;
}

/**
 * The last `length` characters of an assistant text. An honest answer can be longer than
 * MAX_ASSISTANT_CHARS: a model above the limit's characters per token at the token cap, or a mock
 * that ignores the cap. The client posts it again with every later message, so a 400 would fail
 * each one, Retry included. The end is kept because "continue" is the natural follow-up to a cut
 * answer. The cut never starts on the second half of a surrogate pair.
 */
function clipEnd(text: string, length: number): string {
  if (text.length <= length) return text;
  let start = text.length - length;
  const code = text.charCodeAt(start);
  if (code >= 0xdc00 && code <= 0xdfff) start += 1;
  return text.slice(start);
}

/** The approval's decision fields, and nothing a client may add (signature, descriptor, ...). */
function approvalOf(part: RawToolPart): RawToolPart["approval"] {
  if (part.approval === undefined) return undefined;
  const { id, approved, reason, isAutomatic } = part.approval;
  return {
    id,
    ...(approved !== undefined ? { approved } : {}),
    ...(reason !== undefined ? { reason } : {}),
    ...(isAutomatic !== undefined ? { isAutomatic } : {}),
  };
}

/**
 * A tool part of an offered tool, rebuilt field by field, or null to leave it out. A call that
 * ran, failed or was denied stays anywhere. A card and its answer stay only in the history's
 * last message, the continuation the SDK acts on (ai collect-tool-approvals.ts); anywhere else
 * the SDK never runs them, and an approved call kept there would reach the model with no result,
 * so they are dropped instead of refused (P2's spec §4.3). A person's rejection is kept anywhere:
 * outside the last message its continuation never came (a Stop, a 429, a lost connection), so it
 * becomes the output-denied part that continuation would have left, which the model sees as a
 * denied result. The server's fold then still counts it, as the browser's does, and the gate
 * denies every later write (spec §3 B7). A call that never finished (streaming, waiting for its
 * run, or a preliminary output) is dropped, as convertToModelMessages'
 * ignoreIncompleteToolCalls drops it.
 */
function rebuildToolPart(part: RawToolPart, inLastMessage: boolean): Part | null {
  const { type, toolCallId, state } = part;
  const approval = approvalOf(part);
  const withApproval = approval === undefined ? {} : { approval };
  switch (state) {
    case "output-available":
      if (part.preliminary === true) return null;
      return {
        type,
        toolCallId,
        state,
        input: part.input,
        output: part.output,
        ...withApproval,
      } as Part;
    case "output-error": {
      // The SDK leaves a call the model sent with a bad input as `rawInput` (deprecated).
      const input = part.input === undefined ? part.rawInput : part.input;
      return { type, toolCallId, state, input, errorText: part.errorText, ...withApproval } as Part;
    }
    case "output-denied":
      return { type, toolCallId, state, input: part.input, ...withApproval } as Part;
    case "approval-requested":
    case "approval-responded":
      if (inLastMessage) {
        return { type, toolCallId, state, input: part.input, ...withApproval } as Part;
      }
      if (state === "approval-responded" && approval?.approved === false) {
        return { type, toolCallId, state: "output-denied", input: part.input, approval } as Part;
      }
      return null;
    default:
      return null;
  }
}

/**
 * An assistant message's kept parts, in order: step-starts, texts and the offered tools' parts.
 * Its texts together are cut to their last MAX_ASSISTANT_CHARS characters.
 */
function keptAssistantParts(message: UIMessage, tools: ToolSet, inLastMessage: boolean): Part[] {
  const kept: Part[] = [];
  for (const part of message.parts) {
    if (part.type === "step-start") kept.push({ type: "step-start" });
    else if (part.type === "text") kept.push({ type: "text", text: part.text });
    else if (part.type.startsWith("tool-") && Object.hasOwn(tools, part.type.slice(5))) {
      const rebuilt = rebuildToolPart(part as RawToolPart, inLastMessage);
      if (rebuilt !== null) kept.push(rebuilt);
    }
  }
  let budget = MAX_ASSISTANT_CHARS;
  for (let i = kept.length - 1; i >= 0; i--) {
    const part = kept[i];
    if (part.type !== "text") continue;
    const text = budget > 0 ? clipEnd(part.text, budget) : "";
    budget -= part.text.length;
    if (text === "") kept.splice(i, 1);
    else kept[i] = { type: "text", text };
  }
  return kept;
}

/** Whether an assistant message says or does anything: a non-blank text or a tool part. */
function hasContent(parts: readonly Part[]): boolean {
  return parts.some(
    (part) => isToolPart(part) || (part.type === "text" && part.text.trim() !== ""),
  );
}

/**
 * Validates the body the chat transport posts, the whole history (X-01 design §4.2), and
 * cleans its messages for the model. `tools` are the tools the route offers: their parts stay,
 * and their inputs are checked against their schemas. Pure; async only because
 * safeValidateUIMessages is.
 *
 * Order: shape and role checks, then limits on the messages as received, then cleaning, then
 * the SDK's check of the kept tool parts against the tools. Limits are not re-checked after
 * merging, so a stopped and re-sent prompt never produces a 400. An assistant text over
 * MAX_ASSISTANT_CHARS is not rejected but cut to its end while cleaning, so the model's input
 * stays bounded and an honest history never gets a 400.
 *
 * The cleaned messages are rebuilt as { id, role, parts }: a user message as one text part, an
 * assistant message as its step-starts, texts and the offered tools' parts, each rebuilt field by
 * field (state, input, output, error, approval). Every other field a client sent (metadata,
 * providerMetadata, provider options, signatures) is dropped, so a forged body cannot pass
 * provider options to the model.
 */
export async function validateAndClean(
  body: unknown,
  tools: ToolSet = {},
): Promise<ValidateResult> {
  // 1. Shape and role.
  const parsed = await safeValidateUIMessages({
    messages: isRecord(body) ? body.messages : undefined,
  });
  if (!parsed.success) return reject(VALIDATION_ERRORS.shape);
  const received = parsed.data;

  for (const message of received) {
    if (message.role !== "user" && message.role !== "assistant") {
      return reject(VALIDATION_ERRORS.role);
    }
    if (message.role === "user" && message.parts.some((part) => part.type !== "text")) {
      return reject(VALIDATION_ERRORS.userPart);
    }
  }

  // 2. Limits, on the messages as received.
  if (received.length > MAX_MESSAGES) return reject(VALIDATION_ERRORS.tooMany);

  for (const message of received) {
    if (message.role === "user" && messageText(message).length > MAX_USER_CHARS) {
      return reject(VALIDATION_ERRORS.userTooLong);
    }
    const toolParts = message.parts.filter(isToolPart) as RawToolPart[];
    if (toolParts.length > MAX_TOOL_PARTS) return reject(VALIDATION_ERRORS.toolParts);
    for (const part of toolParts) {
      if (toolPartSize(part) > MAX_TOOL_PART_CHARS) {
        return reject(VALIDATION_ERRORS.toolPartTooLong);
      }
      if ((part.approval?.reason?.length ?? 0) > MAX_APPROVAL_REASON_CHARS) {
        return reject(VALIDATION_ERRORS.approvalReason);
      }
    }
  }

  // 3. Cleaning: keep the assistant's step-starts, texts and offered tools' parts; drop an
  // assistant turn that says and does nothing (left by an early Stop), and merge consecutive user
  // messages with a blank line.
  const cleaned: UIMessage[] = [];
  for (const [index, message] of received.entries()) {
    if (message.role === "assistant") {
      const parts = keptAssistantParts(message, tools, index === received.length - 1);
      if (hasContent(parts)) cleaned.push({ id: message.id, role: "assistant", parts });
      continue;
    }

    const text = messageText(message);
    const previous = cleaned.at(-1);
    if (previous?.role === "user") {
      previous.parts = [{ type: "text", text: `${messageText(previous)}\n\n${text}` }];
    } else {
      cleaned.push({ id: message.id, role: "user", parts: [{ type: "text", text }] });
    }
  }

  if (!cleaned.some((message) => message.role === "user")) {
    return reject(VALIDATION_ERRORS.noUser);
  }

  // 4. The kept tool parts against their tools: the SDK checks each input with its tool's schema,
  // and keeps a failed call whose input the tool refuses as a dynamic part (ai
  // validate-ui-messages.ts).
  const checked = await safeValidateUIMessages({ messages: cleaned, tools });
  if (!checked.success) return reject(VALIDATION_ERRORS.toolInput);
  return { ok: true, messages: checked.data };
}

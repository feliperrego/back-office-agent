import type { UIMessage } from "ai";
import { isWriteTool, type ProposedCall } from "./calls";
import { SandboxDenied, apply, type DenialCode, type Sandbox } from "./sandbox";

/**
 * The sandbox a conversation leaves (spec §4.2, P2-18): the seed plus the conversation's executed
 * writes, replayed in order through apply(), so the audit log and the state are one thing (spec
 * §2: "the audit log is the list of the conversation's tool calls"). The route folds the posted
 * UI messages once into the sandbox its gate and every execute read; the browser folds its own
 * for the request pane and the card; the eval folds each case for its final orders. Pure and
 * client-safe.
 *
 * It reads the write parts of the assistant's messages as AI SDK 7.0.114 leaves them (ai
 * dist/index.d.ts, UIToolInvocation; src/ui/process-ui-message-stream.ts): an approved write
 * that ran is output-available and keeps its approval; a person's rejection is approved: false,
 * before (approval-responded) and after (output-denied) the continuation; a gate denial is
 * isAutomatic; a server re-check that overrides a person's approval leaves the part
 * output-denied with approved: true.
 */

/** An executed write the fold did not apply: the scorer's hard failure (spec §5). */
export type NotApplied = {
  toolCallId: string;
  toolName: string;
  /** "not-approved": it ran without a person's approval. */
  code: DenialCode | "not-approved";
};

export type Folded = { sandbox: Sandbox; notApplied: NotApplied[] };

type WritePart = ProposedCall & {
  state: string;
  preliminary?: boolean;
  approval?: { approved?: boolean; isAutomatic?: boolean };
};

/** The message's write parts, read field by field; any other part is left out. */
function writeParts(message: UIMessage): WritePart[] {
  if (message.role !== "assistant") return [];
  return message.parts.flatMap((part): WritePart[] => {
    if (!part.type.startsWith("tool-") || !("toolCallId" in part)) return [];
    const toolName = part.type.slice("tool-".length);
    if (!isWriteTool(toolName)) return [];
    const { toolCallId, state, input } = part;
    const approval = "approval" in part ? part.approval : undefined;
    const preliminary = "preliminary" in part ? part.preliminary : undefined;
    return [{ toolCallId, toolName, input, state, preliminary, approval }];
  });
}

const byPerson = (part: WritePart) => part.approval?.isAutomatic !== true;

function ran(part: WritePart): boolean {
  return part.state === "output-available" && part.preliminary !== true;
}

function rejectedByPerson(part: WritePart): boolean {
  return (
    (part.state === "approval-responded" || part.state === "output-denied") &&
    part.approval?.approved === false &&
    byPerson(part)
  );
}

/** A write a person has yet to decide, or approved and not yet run. */
function waiting(part: WritePart): boolean {
  if (part.state === "approval-requested") return byPerson(part);
  return part.state === "approval-responded" && part.approval?.approved === true;
}

export function fold(seed: Sandbox, messages: readonly UIMessage[]): Folded {
  let sandbox: Sandbox = { ...seed, pending: null };
  const notApplied: NotApplied[] = [];
  for (const message of messages) {
    for (const part of writeParts(message)) {
      if (rejectedByPerson(part)) {
        sandbox = { ...sandbox, rejected: true };
        continue;
      }
      if (!ran(part)) continue;
      const { toolCallId, toolName } = part;
      if (part.approval?.approved !== true || !byPerson(part)) {
        notApplied.push({ toolCallId, toolName, code: "not-approved" });
        continue;
      }
      try {
        sandbox = apply(part, sandbox);
      } catch (error) {
        if (!(error instanceof SandboxDenied)) throw error;
        notApplied.push({ toolCallId, toolName, code: error.code });
      }
    }
  }
  // A card counts as pending only in the conversation's last message: a later message leaves an
  // undecided card behind, and the history drops its approval (spec §4.3).
  const last = messages.at(-1);
  const pending = last ? writeParts(last).find(waiting) : undefined;
  return { sandbox: { ...sandbox, pending: pending?.toolCallId ?? null }, notApplied };
}

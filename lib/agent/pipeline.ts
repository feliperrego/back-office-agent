import {
  convertToModelMessages,
  isStepCount,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type TextStreamPart,
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { MAX_OUTPUT_TOKENS, MAX_STEPS } from "@/lib/ai/limits";
import { CHUNK_TIMEOUT_MS, FIRST_CHUNK_TIMEOUT_MS } from "@/lib/chat/config";
import { toSafeErrorMessage } from "@/lib/chat/errors";
import { buildInstructions } from "@/lib/chat/instructions";
import type { Locale } from "@/lib/i18n/locale";
import { SandboxDenied } from "@/lib/sandbox/sandbox";
import { TOOL_APPROVAL, TOOLS, toolsContext } from "@/lib/tools";
import { RequestSession } from "./session";

/**
 * One POST of the back-office agent (spec §4.1–§4.3, P2-18), shared by the chat route and the
 * eval (template spec §5.11: a chat project runs its cases through its own pipeline, as P1's
 * lib/support/pipeline.ts). In order:
 * 1. fold the validated history once into the request's sandbox (RequestSession);
 * 2. stream the model with the instructions, the history with its tool parts
 *    (convertToModelMessages with the tools, leaving out calls no one answered), the four tools
 *    scoped to the session through their context, the gate as toolApproval, and at most MAX_STEPS
 *    model calls of at most MAX_OUTPUT_TOKENS each (spec §4.8: per POST; a continuation is one
 *    more POST);
 * 3. turn the stream into UI message chunks, with no reasoning.
 * The SDK runs an approved call at the start of its continuation, before any model call, after
 * the gate decides again (ai stream-text.ts, validate-tool-approvals.ts).
 *
 * Parallel tool calls stay on: the installed Gateway docs pass provider options under the
 * provider's key (@ai-sdk/gateway docs, "Provider-Specific Options"), but no installed package
 * documents an option that turns them off, and the gate holds one write at a time either way
 * (tests/approval-round-trip.test.ts). The messages must already be validated and cleaned
 * (lib/chat/validate.ts, with TOOLS).
 */
export type AgentReplyOptions = {
  model: LanguageModel;
  messages: UIMessage[];
  /** One of REQUEST_IDS (lib/sandbox/requests.ts), validated by the caller. */
  requestId: string;
  locale?: Locale;
  abortSignal?: AbortSignal;
  /**
   * The text a failed step or tool sends instead of its error. The route's hides the raw error
   * (the default); the eval's keeps it for its operator. A write the sandbox refused at run time
   * always says so: its text holds a code, never a provider's detail.
   */
  onError?: (error: unknown) => string;
  /** Message metadata, such as the trace's tokens and latency for the eval (lib/trace/trace.ts). */
  messageMetadata?: (options: { part: TextStreamPart<ToolSet> }) => unknown;
};

export async function streamAgentReply({
  model,
  messages,
  requestId,
  locale,
  abortSignal,
  onError = toSafeErrorMessage,
  messageMetadata,
}: AgentReplyOptions): Promise<{
  stream: ReadableStream<UIMessageChunk>;
  session: RequestSession;
}> {
  const session = new RequestSession(requestId, messages);
  const result = streamText({
    model,
    instructions: buildInstructions({ locale }),
    messages: await convertToModelMessages(messages, {
      tools: TOOLS,
      ignoreIncompleteToolCalls: true,
    }),
    tools: TOOLS,
    toolsContext: toolsContext(session),
    toolApproval: TOOL_APPROVAL,
    stopWhen: isStepCount(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    reasoning: "none",
    abortSignal,
    timeout: { firstChunkMs: FIRST_CHUNK_TIMEOUT_MS, chunkMs: CHUNK_TIMEOUT_MS },
    // Suppresses streamText's own console.error(error) default: the error is already handled
    // once by onError in toUIMessageStream below.
    onError: () => {},
  });
  const stream = toUIMessageStream({
    stream: result.stream,
    tools: TOOLS,
    onError: (error) => (error instanceof SandboxDenied ? error.message : onError(error)),
    sendReasoning: false,
    ...(messageMetadata === undefined ? {} : { messageMetadata }),
  });
  return { stream, session };
}

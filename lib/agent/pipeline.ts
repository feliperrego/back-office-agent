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
import { SAFE_ERROR_MESSAGE, toSafeErrorMessage } from "@/lib/chat/errors";
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
 * Parallel tool calls are off for an OpenAI model (spec §4.2, P2-18; providerOptionsFor below);
 * the gate still holds one write at a time whatever the model sends (tests/approval-round-trip.
 * test.ts). A failed step or tool streams the route's one safe text, in the eval too, since the
 * browser and the eval post it back on the continuation. The messages must already be validated
 * and cleaned (lib/chat/validate.ts, with TOOLS).
 */
export type AgentReplyOptions = {
  model: LanguageModel;
  messages: UIMessage[];
  /** One of REQUEST_IDS (lib/sandbox/requests.ts), validated by the caller. */
  requestId: string;
  locale?: Locale;
  abortSignal?: AbortSignal;
  /**
   * Sees the raw error of a failed step or tool, such as the eval's record for its operator.
   * Default: the route's server log (toSafeErrorMessage). Either way the stream carries
   * SAFE_ERROR_MESSAGE instead of the error, so the model is sent the same history on the
   * continuation in the route and the eval. A write the sandbox refused at run time always says
   * so: its text holds a code, never a provider's detail.
   */
  onError?: (error: unknown) => void;
  /** Message metadata, such as the trace's tokens and latency for the eval (lib/trace/trace.ts). */
  messageMetadata?: (options: { part: TextStreamPart<ToolSet> }) => unknown;
};

/**
 * What the pipeline asks of the provider besides the call: parallel tool calls off for an OpenAI
 * model, named as the AI Gateway names it ("openai/…", P1's AI_MODEL). The Gateway passes options
 * under the provider's own key (@ai-sdk/gateway docs, "Provider-Specific Options"), and the
 * OpenAI provider documents `parallelToolCalls` (ai-sdk.dev, OpenAI provider options, Chat
 * Completions and Responses alike). Other providers and the mock get none. Rollout step 5's real
 * run checks that no step carried two tool calls (the result's `steps`).
 */
export function providerOptionsFor(
  model: LanguageModel,
): Parameters<typeof streamText>[0]["providerOptions"] {
  const id = typeof model === "string" ? model : model.modelId;
  return id.startsWith("openai/") ? { openai: { parallelToolCalls: false } } : undefined;
}

/**
 * The stream's text for a failed step or tool: a sandbox code, or the route's safe text. The
 * raw error goes to `observe` (default: the route's server log) once per text: the SDK streams an
 * invalid input twice, as the input's error and then as the call's, the second time as the
 * first's text (ai to-ui-message-chunk.ts, tool-input-error and tool-output-error).
 */
function errorTexts(observe: (error: unknown) => void): (error: unknown) => string {
  const seen = new Set<string>();
  return (error) => {
    if (error instanceof SandboxDenied) return error.message;
    const text = String(error);
    if (!seen.has(text)) observe(error);
    seen.add(text);
    return SAFE_ERROR_MESSAGE;
  };
}

export async function streamAgentReply({
  model,
  messages,
  requestId,
  locale,
  abortSignal,
  onError,
  messageMetadata,
}: AgentReplyOptions): Promise<{
  stream: ReadableStream<UIMessageChunk>;
  session: RequestSession;
}> {
  const session = new RequestSession(requestId, messages);
  const providerOptions = providerOptionsFor(model);
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
    ...(providerOptions === undefined ? {} : { providerOptions }),
    abortSignal,
    timeout: { firstChunkMs: FIRST_CHUNK_TIMEOUT_MS, chunkMs: CHUNK_TIMEOUT_MS },
    // Suppresses streamText's own console.error(error) default: the error is already handled
    // once by onError in toUIMessageStream below.
    onError: () => {},
  });
  const stream = toUIMessageStream({
    stream: result.stream,
    tools: TOOLS,
    onError: errorTexts(onError ?? toSafeErrorMessage),
    sendReasoning: false,
    ...(messageMetadata === undefined ? {} : { messageMetadata }),
  });
  return { stream, session };
}

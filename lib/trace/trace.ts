import type { LanguageModelUsage, TextStreamPart, ToolSet, UIMessage } from "ai";

/**
 * What the trace shows of an answer besides its tool calls (template spec §5.10): its tokens and
 * its latency, which travel in the metadata of the stream's finish chunk, and the checks an eval
 * scored it by. There is no dollar cost: tokens are the measured stand-in. Pure and client-safe.
 */

/** The tokens of every model call of one answer, summed; null for a count the provider did not report. */
export type TokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

/** What an answer's finish chunk carries for the trace. */
export type TraceMetadata = {
  usage: TokenUsage;
  /** The answer's time on the server, from its start to its last model step, in whole milliseconds. */
  latencyMs: number;
};

/**
 * One condition an eval scored an answer by. `detail` holds the data behind a failure, never prose;
 * the project names each id in the interface language.
 */
export type Check = { id: string; ok: boolean; detail?: string[] };

/** The three totals of a model call's usage, with null for a count it left out. */
export function tokenUsage({
  inputTokens,
  outputTokens,
  totalTokens,
}: LanguageModelUsage): TokenUsage {
  return {
    inputTokens: inputTokens ?? null,
    outputTokens: outputTokens ?? null,
    totalTokens: totalTokens ?? null,
  };
}

/**
 * toUIMessageStream's `messageMetadata`: on the finish part, the answer's tokens over every step
 * and the time since `started` (performance.now() when the answer began); nothing on any other
 * part. `now` is for tests.
 */
export function traceMetadataOnFinish(
  started: number,
  now: () => number = () => performance.now(),
): (options: { part: TextStreamPart<ToolSet> }) => TraceMetadata | undefined {
  return ({ part }) =>
    part.type === "finish"
      ? { usage: tokenUsage(part.totalUsage), latencyMs: Math.round(now() - started) }
      : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isTokenUsage(value: unknown): value is TokenUsage {
  return (
    isRecord(value) &&
    isCount(value.inputTokens) &&
    isCount(value.outputTokens) &&
    isCount(value.totalTokens)
  );
}

/**
 * An answer's tokens and latency as its message holds them, read as data: a project's metadata may
 * carry more. Null for what has not arrived yet, since both come with the finish chunk.
 */
export function traceMetadataOf(message: UIMessage): {
  usage: TokenUsage | null;
  latencyMs: number | null;
} {
  const metadata = isRecord(message.metadata) ? message.metadata : {};
  const { usage, latencyMs } = metadata;
  return {
    usage: isTokenUsage(usage)
      ? {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        }
      : null,
    latencyMs: typeof latencyMs === "number" ? latencyMs : null,
  };
}

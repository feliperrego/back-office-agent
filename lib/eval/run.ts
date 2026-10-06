import { type LanguageModel, readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";
import type { CaseRecord, EvalCase, EvalProject, Score, TracedResult } from "./record";
import { isScorableTally } from "./stats";

/**
 * The eval's runner (template spec §5.11): every frozen case once, in order, on the server with
 * no browser, through the project's runCase and score (lib/eval/project.ts), stopping at the first
 * case that cannot be scored: an answer that failed, a scorer that throws, or a tally the headline
 * cannot count. So a real run stops after the one paid case it cannot use, never after all of
 * them, and the command writes the cases before it to the aborted file. Shell-owned. It imports
 * nothing of the chat, so a project without a chat keeps it (template spec §9 step 6b); a chat
 * project's runCase runs its chat pipeline and reads the answer with collectUIMessage.
 */

export type RunEvalOptions<Case extends EvalCase, Result extends TracedResult> = Pick<
  EvalProject<Case, Result>,
  "runCase" | "score"
> & {
  cases: readonly Case[];
  model: LanguageModel;
  /** Called with each case's record as soon as it is scored. */
  onResult?: (record: CaseRecord<Result>) => void;
  /** The clock: performance.now() and the current date, for tests. */
  now?: () => number;
  date?: () => Date;
};

/** The text of a thrown value, for an abortReason. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs the cases one after another, and stops at the first whose answer cannot be scored. */
export async function runEval<Case extends EvalCase, Result extends TracedResult>({
  cases,
  model,
  runCase,
  score,
  onResult,
  now = () => performance.now(),
  date = () => new Date(),
}: RunEvalOptions<Case, Result>): Promise<{
  results: CaseRecord<Result>[];
  abortReason: string | null;
}> {
  const results: CaseRecord<Result>[] = [];
  for (const evalCase of cases) {
    const askedAt = date().toISOString();
    const started = now();
    const outcome = await runCase(evalCase, { model });
    const latencyMs = Math.round(now() - started);
    const stop = (reason: string) => ({ results, abortReason: `${evalCase.id}: ${reason}` });
    if ("abortReason" in outcome) return stop(outcome.abortReason);
    let scored: Score;
    try {
      scored = score(evalCase, outcome.result);
    } catch (error) {
      return stop(`the score failed: ${messageOf(error)}`);
    }
    if (!isScorableTally(scored.tally)) {
      return stop(
        "the score's tally must be whole units, 0 <= passed <= total and total >= 1; " +
          `got ${JSON.stringify(scored.tally)}`,
      );
    }
    const record: CaseRecord<Result> = {
      id: evalCase.id,
      group: evalCase.group,
      askedAt,
      ...scored,
      result: outcome.result,
      latencyMs,
    };
    results.push(record);
    onResult?.(record);
  }
  return { results, abortReason: null };
}

/** Every chunk of the answer's stream, in order. */
async function collect(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
}

/** The finished message, reduced from the chunks by the SDK's own reader, as the chat reduces it. */
async function finishedMessage<M extends UIMessage>(chunks: readonly UIMessageChunk[]): Promise<M> {
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  let message: M | undefined;
  for await (const snapshot of readUIMessageStream<M>({ stream })) message = snapshot;
  if (message === undefined) throw new Error("The answer's stream held no message.");
  return message;
}

/**
 * A chat pipeline's answer as the chat holds it, and why it finished; or, for a runCase to return,
 * why the run must stop: a failed answer (with the stream's error text), an aborted one, or a
 * stream that never finished.
 */
export async function collectUIMessage<M extends UIMessage = UIMessage>(
  stream: ReadableStream<UIMessageChunk>,
): Promise<{ message: M; finishReason: string | null } | { abortReason: string }> {
  const chunks = await collect(stream);
  const failure = chunks.find((chunk) => chunk.type === "error");
  if (failure) return { abortReason: `the answer failed: ${failure.errorText}` };
  if (chunks.some((chunk) => chunk.type === "abort")) {
    return { abortReason: "the answer was aborted" };
  }
  const finish = chunks.findLast((chunk) => chunk.type === "finish");
  if (!finish) return { abortReason: "the answer has no finish chunk" };
  return {
    message: await finishedMessage<M>(chunks),
    finishReason: finish.finishReason ?? null,
  };
}

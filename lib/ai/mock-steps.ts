import type { MockLanguageModelV4 } from "ai/test";

/**
 * The mock model's step machine (template spec §5.2). Shell-owned. Every doStream call of the
 * mock is one step: stream a text, call a tool, or run one of the shell's two test scenarios,
 * [[slow]] and [[error]]. The step comes from the prompt, so getModel() never takes arguments:
 * after a tool result the project's scenarios continue from that result; otherwise the last user
 * message picks the step. The project's cues and answers live in lib/ai/mock-scenarios.ts
 * (project-owned). Nothing here imports lib/chat/, so the mock survives the removal recipe of a
 * non-chat project (template spec §9 step 6b).
 */

/** The prompt a V4 model receives in doStream(options).prompt. */
export type MockPrompt = Parameters<MockLanguageModelV4["doStream"]>[0]["prompt"];

/** What one model call of the mock does: stream text, call a tool, or one of the shell's tests. */
export type MockStep =
  | { kind: "text"; text: string }
  | { kind: "tool-call"; toolCallId: string; toolName: string; input: Record<string, unknown> }
  | { kind: "slow" }
  | { kind: "error" };

/** One model call, as a project's scenarios see it. */
export type MockTurn = {
  /** The whole prompt: the instructions, the history and any tool results. */
  prompt: MockPrompt;
  /** The text of the last user message. */
  message: string;
  /** The id a tool call made in this step takes. */
  toolCallId: string;
};

/** A tool's result, as the next step's prompt carries it. */
export type MockToolResult = { toolName: string; value: unknown };

/**
 * A project's cues and answers (lib/ai/mock-scenarios.ts exports them as MOCK_SCENARIOS): what
 * the mock does for a user message, and after a tool result.
 */
export type MockScenarios = {
  /** The step for a user message that neither [[error]] nor [[slow]] claimed. */
  firstStep(turn: MockTurn): MockStep;
  /**
   * The step after a tool result: the last one of the prompt's closing tool message. Undefined
   * starts over from the user message, as if no tool had run.
   */
  afterTool(result: MockToolResult, turn: MockTurn): MockStep | undefined;
};

export const SLOW_TRIGGER = "[[slow]]";
export const ERROR_TRIGGER = "[[error]]";

/** [[slow]]: 300 short lines, far taller than an 800 px viewport (~9 s at 30 ms per chunk). */
export const SLOW_CHUNKS: readonly string[] = Array.from(
  { length: 300 },
  (_, i) => `Line ${i + 1} of the slow mock answer.\n`,
);

/** [[error]]: the text streamed before the mock fails. */
export const ERROR_CHUNKS: readonly string[] = ["This ", "answer ", "fails "];

/** The raw error the [[error]] scenario emits; the route must never send it to the client. */
export const MOCK_ERROR_MESSAGE = "Mock model failure ([[error]] scenario)";

/**
 * The mock's default answer, a fixed ~120-word English paragraph: createMockModel's chunks when
 * a test passes none, and the template's answer to a message with no cue (template spec §5.2).
 */
export const DEFAULT_MOCK_TEXT =
  "Streaming lets an answer appear while it is still being written. " +
  "Instead of waiting for the whole response, the interface shows each word " +
  "as soon as the model produces it. That makes a slow answer feel fast, and " +
  "it gives the reader a chance to stop early when the answer is already good " +
  "enough, or clearly going in the wrong direction. This paragraph comes from " +
  "the mock model in the portfolio template. It is split into one chunk per " +
  "word, with a short delay before the first chunk and a small gap between the " +
  "rest, so tests and demos can exercise streaming, stopping, and time to " +
  "first token without calling a real model or spending any money. Nothing " +
  "here was generated; it is the same text every time, which keeps every test " +
  "run predictable.";

// Message texts that already produced the [[error]] scenario in this server process. The first
// request with a given text fails; Retry (same text) gets the answer.
const seenErrorPrompts = new Set<string>();

/** Text of the last user message in the prompt, or "" when there is none. */
export function lastUserText(prompt: MockPrompt): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const message = prompt[i];
    if (message.role === "user") {
      return message.content.map((part) => (part.type === "text" ? part.text : "")).join("");
    }
  }
  return "";
}

/**
 * The JSON tool results of the prompt's last message, when it is a tool message. A result that
 * is not JSON, such as a tool's error, is left out.
 */
export function lastToolResults(prompt: MockPrompt): MockToolResult[] {
  const last = prompt.at(-1);
  if (last?.role !== "tool") return [];
  return last.content.flatMap((part) =>
    part.type === "tool-result" && part.output.type === "json"
      ? [{ toolName: part.toolName, value: part.output.value }]
      : [],
  );
}

/** The id of a tool call made now: one more than the prompt's tool messages. */
export function nextCallId(prompt: MockPrompt): string {
  return `mock-call-${prompt.filter((message) => message.role === "tool").length + 1}`;
}

/**
 * The mock's next step for this prompt. After a tool result, the project's afterTool continues
 * from it. Otherwise [[error]] wins, but only the first time this process sees that exact
 * message, then [[slow]], then the project's firstStep.
 */
export function mockStep(prompt: MockPrompt, scenarios: MockScenarios): MockStep {
  const turn: MockTurn = { prompt, message: lastUserText(prompt), toolCallId: nextCallId(prompt) };
  const result = lastToolResults(prompt).at(-1);
  if (result !== undefined) {
    const next = scenarios.afterTool(result, turn);
    if (next !== undefined) return next;
  }
  if (turn.message.includes(ERROR_TRIGGER) && !seenErrorPrompts.has(turn.message)) {
    seenErrorPrompts.add(turn.message);
    return { kind: "error" };
  }
  if (turn.message.includes(SLOW_TRIGGER)) return { kind: "slow" };
  return scenarios.firstStep(turn);
}

/** Test helper: forget which [[error]] messages were already seen. */
export function resetMockScenarios(): void {
  seenErrorPrompts.clear();
}

import { beforeEach, describe, expect, it } from "vitest";
import {
  ERROR_TRIGGER,
  SLOW_TRIGGER,
  lastToolResults,
  lastUserText,
  mockStep,
  nextCallId,
  resetMockScenarios,
  type MockPrompt,
  type MockScenarios,
  type MockToolResult,
  type MockTurn,
} from "./mock-steps";

// The step machine (template spec §5.2). These tests drive it with their own scenarios, never
// the project's (lib/ai/mock-scenarios.ts), so they hold whatever cues and answers a project
// writes. The set of [[error]] texts already seen is module state, so every test starts clean.

beforeEach(() => resetMockScenarios());

/** A test's scenarios: "use the tool" calls fixtureTool, anything else gets a fixed text. */
function fixtureScenarios(calls: { first: MockTurn[]; after: [MockToolResult, MockTurn][] }) {
  const scenarios: MockScenarios = {
    firstStep(turn) {
      calls.first.push(turn);
      return turn.message.includes("use the tool")
        ? { kind: "tool-call", toolCallId: turn.toolCallId, toolName: "fixtureTool", input: {} }
        : { kind: "text", text: "Fixture answer." };
    },
    afterTool(result, turn) {
      calls.after.push([result, turn]);
      return result.toolName === "fixtureTool"
        ? { kind: "text", text: `Fixture result: ${JSON.stringify(result.value)}` }
        : undefined;
    },
  };
  return scenarios;
}

function track() {
  const calls = { first: [] as MockTurn[], after: [] as [MockToolResult, MockTurn][] };
  return { calls, scenarios: fixtureScenarios(calls) };
}

function userMessage(text: string): MockPrompt[number] {
  return { role: "user", content: [{ type: "text", text }] };
}

function toolCall(toolCallId: string, toolName: string): MockPrompt[number] {
  return { role: "assistant", content: [{ type: "tool-call", toolCallId, toolName, input: {} }] };
}

function toolMessage(
  ...results: { toolCallId: string; toolName: string; output: unknown }[]
): MockPrompt[number] {
  return {
    role: "tool",
    content: results.map(({ toolCallId, toolName, output }) => ({
      type: "tool-result" as const,
      toolCallId,
      toolName,
      output: output as never,
    })),
  };
}

/** A prompt that ends with one JSON tool result, as streamText builds the step after a call. */
function afterTool(text: string, toolName: string, value: unknown): MockPrompt {
  return [
    { role: "system", content: "Instructions." },
    userMessage(text),
    toolCall("mock-call-1", toolName),
    toolMessage({ toolCallId: "mock-call-1", toolName, output: { type: "json", value } }),
  ];
}

describe("lastUserText", () => {
  it("reads the text parts of the last user message only", () => {
    const prompt: MockPrompt = [
      { role: "system", content: "[[error]] in the instructions" },
      userMessage("[[slow]] earlier"),
      { role: "assistant", content: [{ type: "text", text: "[[error]] in an answer" }] },
      {
        role: "user",
        content: [
          { type: "text", text: "last " },
          { type: "text", text: "message" },
        ],
      },
    ];
    expect(lastUserText(prompt)).toBe("last message");
  });

  it('returns "" when there is no user message', () => {
    expect(lastUserText([{ role: "system", content: "x" }])).toBe("");
  });
});

describe("lastToolResults", () => {
  it("reads the JSON results of the prompt's last message when it is a tool message", () => {
    const prompt: MockPrompt = [
      userMessage("q"),
      toolCall("c-1", "first"),
      toolMessage(
        { toolCallId: "c-1", toolName: "first", output: { type: "json", value: { a: 1 } } },
        { toolCallId: "c-2", toolName: "second", output: { type: "json", value: [2] } },
      ),
    ];
    expect(lastToolResults(prompt)).toEqual([
      { toolName: "first", value: { a: 1 } },
      { toolName: "second", value: [2] },
    ]);
  });

  it("skips a result that is not JSON, such as a tool's error", () => {
    const prompt: MockPrompt = [
      userMessage("q"),
      toolCall("c-1", "broken"),
      toolMessage({
        toolCallId: "c-1",
        toolName: "broken",
        output: { type: "error-text", value: "x" },
      }),
    ];
    expect(lastToolResults(prompt)).toEqual([]);
  });

  it("returns none when the last message is not a tool message", () => {
    const prompt = afterTool("q", "fixtureTool", { a: 1 });
    expect(lastToolResults([...prompt, userMessage("next")])).toEqual([]);
    expect(lastToolResults([])).toEqual([]);
  });
});

describe("nextCallId", () => {
  it("is one more than the prompt's tool messages", () => {
    expect(nextCallId([userMessage("q")])).toBe("mock-call-1");
    expect(nextCallId(afterTool("q", "fixtureTool", {}))).toBe("mock-call-2");
  });
});

describe("mockStep", () => {
  it("passes a user message the shell does not claim to the project's first step", () => {
    const { calls, scenarios } = track();
    const prompt: MockPrompt = [
      { role: "system", content: "Instructions." },
      userMessage("earlier"),
      userMessage("Hello there"),
    ];
    expect(mockStep(prompt, scenarios)).toEqual({ kind: "text", text: "Fixture answer." });
    expect(calls.first).toEqual([{ prompt, message: "Hello there", toolCallId: "mock-call-1" }]);
    expect(calls.after).toEqual([]);
  });

  it("returns the project's tool call, with the next call id", () => {
    const { scenarios } = track();
    expect(mockStep([userMessage("please use the tool")], scenarios)).toEqual({
      kind: "tool-call",
      toolCallId: "mock-call-1",
      toolName: "fixtureTool",
      input: {},
    });
  });

  it("after a tool result, takes the project's next step for that result", () => {
    const { calls, scenarios } = track();
    const prompt = afterTool("please use the tool", "fixtureTool", { found: true });
    expect(mockStep(prompt, scenarios)).toEqual({
      kind: "text",
      text: 'Fixture result: {"found":true}',
    });
    expect(calls.after).toEqual([
      [
        { toolName: "fixtureTool", value: { found: true } },
        { prompt, message: "please use the tool", toolCallId: "mock-call-2" },
      ],
    ]);
    expect(calls.first).toEqual([]);
  });

  it("after a result the project does not continue, starts over from the user message", () => {
    const { calls, scenarios } = track();
    const prompt = afterTool("Hello", "otherTool", {});
    expect(mockStep(prompt, scenarios)).toEqual({ kind: "text", text: "Fixture answer." });
    expect(calls.after).toHaveLength(1);
    expect(calls.first).toHaveLength(1);
  });

  it("passes the last of several results", () => {
    const { calls, scenarios } = track();
    const prompt: MockPrompt = [
      userMessage("use the tool twice"),
      toolCall("mock-call-1", "fixtureTool"),
      toolMessage(
        { toolCallId: "a", toolName: "otherTool", output: { type: "json", value: 1 } },
        { toolCallId: "b", toolName: "fixtureTool", output: { type: "json", value: 2 } },
      ),
    ];
    expect(mockStep(prompt, scenarios)).toEqual({ kind: "text", text: "Fixture result: 2" });
    expect(calls.after.map(([result]) => result)).toEqual([{ toolName: "fixtureTool", value: 2 }]);
  });

  it(`gives ${SLOW_TRIGGER} the slow step, before any project cue`, () => {
    const { calls, scenarios } = track();
    expect(mockStep([userMessage(`${SLOW_TRIGGER} use the tool`)], scenarios)).toEqual({
      kind: "slow",
    });
    expect(mockStep([userMessage(SLOW_TRIGGER)], scenarios)).toEqual({ kind: "slow" });
    expect(calls.first).toEqual([]);
  });

  it(`fails for ${ERROR_TRIGGER} only the first time it sees the exact text`, () => {
    const { scenarios } = track();
    const once = [userMessage(`${ERROR_TRIGGER} once`)];
    expect(mockStep(once, scenarios)).toEqual({ kind: "error" });
    expect(mockStep(once, scenarios)).toEqual({ kind: "text", text: "Fixture answer." });
    expect(mockStep([userMessage(`${ERROR_TRIGGER} once again`)], scenarios)).toEqual({
      kind: "error",
    });
  });

  it(`lets ${ERROR_TRIGGER} win over ${SLOW_TRIGGER}, then falls back to slow`, () => {
    const { scenarios } = track();
    const both = [userMessage(`${SLOW_TRIGGER} ${ERROR_TRIGGER}`)];
    expect(mockStep(both, scenarios)).toEqual({ kind: "error" });
    expect(mockStep(both, scenarios)).toEqual({ kind: "slow" });
  });

  it("looks only at the last user message", () => {
    const { scenarios } = track();
    const prompt = (...texts: string[]) => texts.map(userMessage);
    expect(mockStep(prompt(`${ERROR_TRIGGER} earlier`, `${SLOW_TRIGGER} now`), scenarios)).toEqual(
      { kind: "slow" },
    );
    expect(mockStep(prompt(`${SLOW_TRIGGER} earlier`, "plain now"), scenarios)).toEqual({
      kind: "text",
      text: "Fixture answer.",
    });
  });

  it("forgets the seen texts on resetMockScenarios", () => {
    const { scenarios } = track();
    const prompt = [userMessage(`${ERROR_TRIGGER} reset`)];
    expect(mockStep(prompt, scenarios)).toEqual({ kind: "error" });
    resetMockScenarios();
    expect(mockStep(prompt, scenarios)).toEqual({ kind: "error" });
  });
});

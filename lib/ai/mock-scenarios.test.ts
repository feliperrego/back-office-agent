import { isStepCount, jsonSchema, streamText, tool } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_TOOL_NAME } from "@/lib/tools";
import { MAX_STEPS } from "./limits";
import { createScenarioMockModel } from "./mock";
import { MOCK_SCENARIOS, itemAnswer, itemIdOf } from "./mock-scenarios";
import {
  DEFAULT_MOCK_TEXT,
  mockStep,
  resetMockScenarios,
  type MockPrompt,
  type MockTurn,
} from "./mock-steps";

// The template's mock scenarios (template spec §5.2): the default answer, and the sample tool's
// lookup of a fictional item. Project-owned, like the file it tests: a project that replaces its
// cues and answers replaces these tests.

beforeEach(() => resetMockScenarios());

function turn(message: string, toolCallId = "mock-call-1"): MockTurn {
  return { prompt: [], message, toolCallId };
}

const FOUND = {
  found: true,
  item: { id: "ITM-0042", name: "Brass desk lamp", status: "available" },
};
const NOT_FOUND = { found: false, itemId: "ITM-0099" };

describe("itemIdOf", () => {
  it("reads the item id a message names, in upper case", () => {
    expect(itemIdOf("What is the status of item ITM-0042?")).toBe("ITM-0042");
    expect(itemIdOf("look up itm-0007 please")).toBe("ITM-0007");
  });

  it.each(["What is item 42?", "ITM-42", "ITM-00420", "XITM-0042", "Tell me a story"])(
    "finds no item id in %j",
    (text) => {
      expect(itemIdOf(text)).toBeNull();
    },
  );
});

describe("MOCK_SCENARIOS.firstStep", () => {
  it("gives a message with no item id the default answer", () => {
    expect(MOCK_SCENARIOS.firstStep(turn("Tell me something"))).toEqual({
      kind: "text",
      text: DEFAULT_MOCK_TEXT,
    });
  });

  it("calls the sample tool for the item a message names, with the turn's call id", () => {
    expect(MOCK_SCENARIOS.firstStep(turn("Where is itm-0042?", "mock-call-3"))).toEqual({
      kind: "tool-call",
      toolCallId: "mock-call-3",
      toolName: SAMPLE_TOOL_NAME,
      input: { itemId: "ITM-0042" },
    });
  });
});

describe("MOCK_SCENARIOS.afterTool", () => {
  it("answers the sample tool's result", () => {
    const step = MOCK_SCENARIOS.afterTool(
      { toolName: SAMPLE_TOOL_NAME, value: FOUND },
      turn("Where is ITM-0042?"),
    );
    expect(step).toEqual({ kind: "text", text: itemAnswer(FOUND) });
  });

  it("leaves another tool's result to the step machine", () => {
    expect(MOCK_SCENARIOS.afterTool({ toolName: "otherTool", value: FOUND }, turn("x"))).toBe(
      undefined,
    );
  });
});

describe("itemAnswer", () => {
  it("names the item and its status", () => {
    expect(itemAnswer(FOUND)).toBe("Item ITM-0042 (Brass desk lamp) is available.");
  });

  it("says an item was not found, naming the id it was asked for", () => {
    expect(itemAnswer(NOT_FOUND)).toBe("I couldn't find item ITM-0099. Please check the item id.");
  });

  it.each([[null], ["text"], [{ found: true }], [{ found: true, item: "x" }], [[]]])(
    "treats the unexpected result %j as not found",
    (value) => {
      expect(itemAnswer(value)).toBe("I couldn't find that item. Please check the item id.");
    },
  );
});

describe("the sample tool scenario through streamText", () => {
  it(`looks an item up and answers from the result, within MAX_STEPS model calls`, async () => {
    const model = createScenarioMockModel({ initialDelayInMs: 0, chunkDelayInMs: 0 });
    const execute = vi.fn<(input: { itemId: string }) => Promise<typeof FOUND>>(async () => FOUND);
    const result = streamText({
      model,
      messages: [{ role: "user", content: "What is the status of item ITM-0042?" }],
      tools: {
        [SAMPLE_TOOL_NAME]: tool({
          inputSchema: jsonSchema<{ itemId: string }>({
            type: "object",
            properties: { itemId: { type: "string" } },
            required: ["itemId"],
          }),
          execute,
        }),
      },
      stopWhen: isStepCount(MAX_STEPS),
      maxOutputTokens: 100,
    });

    expect(await result.text).toBe(itemAnswer(FOUND));
    expect(execute.mock.calls.map(([input]) => input)).toEqual([{ itemId: "ITM-0042" }]);
    expect(model.doStreamCalls).toHaveLength(2);
    expect(model.doStreamCalls.length).toBeLessThanOrEqual(MAX_STEPS);
  });

  it("lets the shell's [[slow]] win over an item id", () => {
    const prompt: MockPrompt = [
      { role: "user", content: [{ type: "text", text: "[[slow]] ITM-0042" }] },
    ];
    expect(mockStep(prompt, MOCK_SCENARIOS)).toEqual({ kind: "slow" });
  });
});

import { isStepCount, streamText } from "ai";
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_OUTPUT_TOKENS, MAX_STEPS } from "@/lib/ai/limits";
import { createScenarioMockModel } from "@/lib/ai/mock";
import { itemAnswer, itemIdOf } from "@/lib/ai/mock-scenarios";
import { resetMockScenarios } from "@/lib/ai/mock-steps";
import { format } from "@/lib/i18n/format";
import { LOCALES } from "@/lib/i18n/locale";
import { messages, toolLabel } from "@/lib/i18n/messages";
import type { ToolState } from "@/lib/trace/tool-view";
import { SAMPLE_ITEMS, SAMPLE_TOOL_NAME, TOOLS, lookUpItem } from "./tools";

/** Every state a chip shows. */
const STATES: readonly ToolState[] = [
  "running",
  "awaiting-approval",
  "done",
  "error",
  "denied",
  "interrupted",
];

// The template's tools (template spec §5.10): the sample lookup of a fictional item. Project-owned,
// like the file it tests: a project that replaces its tools replaces these tests.

beforeEach(() => resetMockScenarios());

describe("lookUpItem", () => {
  it("finds an item by its id", () => {
    expect(lookUpItem("ITM-0042")).toEqual({
      found: true,
      item: { id: "ITM-0042", name: "Brass desk lamp", status: "available" },
    });
  });

  it("reads an id in any case, with spaces around it", () => {
    expect(lookUpItem("  itm-0108 ")).toEqual({ found: true, item: SAMPLE_ITEMS[1] });
  });

  it("answers an unknown id as not found, naming the id it was asked for", () => {
    expect(lookUpItem("itm-0099")).toEqual({ found: false, itemId: "ITM-0099" });
    expect(lookUpItem("lamp")).toEqual({ found: false, itemId: "LAMP" });
  });

  // The mock calls the tool for a message that names an id: every sample item must be one.
  it("knows only ids the mock's cue reads", () => {
    for (const { id } of SAMPLE_ITEMS) expect(itemIdOf(`Where is ${id}?`)).toBe(id);
  });
});

describe("TOOLS", () => {
  it("offers the sample tool under its name", () => {
    expect(Object.keys(TOOLS)).toEqual([SAMPLE_TOOL_NAME]);
  });

  it("answers the mock's sample question from the tool's result, within MAX_STEPS model calls", async () => {
    const model = createScenarioMockModel({ initialDelayInMs: 0, chunkDelayInMs: 0 });
    const result = streamText({
      model,
      prompt: "What is the status of item ITM-0042?",
      tools: TOOLS,
      stopWhen: isStepCount(MAX_STEPS),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });

    expect(await result.text).toBe(itemAnswer(lookUpItem("ITM-0042")));
    expect(await result.text).toBe("Item ITM-0042 (Brass desk lamp) is available.");
    expect(model.doStreamCalls).toHaveLength(2);
  });

  // The shell's chip names a tool the project does not name as "Tool: <name>" (template spec
  // §5.10): every tool the project offers gets words of its own, in both languages.
  it.each(LOCALES)("gives every tool a label of its own in %s", (locale) => {
    const t = messages[locale];
    for (const name of Object.keys(TOOLS)) {
      const view = { id: "call-1", name, input: {}, state: "done" as const };
      expect(toolLabel(view, t), name).not.toBe(format(t.toolCall.generic, { name }));
    }
  });

  // The chip puts its state's words after the label ("Working", "Denied", "Not finished"), so the
  // label names the call and claims nothing about it (template spec §5.10).
  it.each(STATES)("labels a sample call %s with the item id it asked for", (state) => {
    const view = { id: "call-1", name: SAMPLE_TOOL_NAME, input: { itemId: "ITM-0042" }, state };
    expect(toolLabel(view, messages.en)).toBe("Item lookup: ITM-0042");
    expect(toolLabel(view, messages["pt-BR"])).toBe("Consulta do item ITM-0042");
  });

  // While the input streams, the id may not be there yet.
  it.each([undefined, {}, { itemId: "" }, { itemId: " " }])(
    "labels a call whose input is %j with no id, not an empty one",
    (input) => {
      const view = { id: "call-1", name: SAMPLE_TOOL_NAME, input, state: "running" as const };
      expect(toolLabel(view, messages.en)).toBe("Item lookup");
      expect(toolLabel(view, messages["pt-BR"])).toBe("Consulta de item");
    },
  );
});

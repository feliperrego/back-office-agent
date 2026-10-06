import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { settledViews, stringField, toolViewsOf, type ToolView } from "./tool-view";

// One tool call as the screens show it (template spec §5.10), read from a message's tool parts in
// every state the SDK gives them.

/** An assistant message holding these parts. */
function answer(...parts: Record<string, unknown>[]): UIMessage {
  return { id: "a", role: "assistant", parts } as unknown as UIMessage;
}

/** A static tool part of the sample shape: tool-<name>, with the call id and the state's fields. */
function toolPart(state: string, fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "tool-lookUpItem",
    toolCallId: "call-1",
    state,
    input: { itemId: "ITM-0042" },
    ...fields,
  };
}

const BASE = { id: "call-1", name: "lookUpItem", input: { itemId: "ITM-0042" } };
const OUTPUT = { found: true, item: { id: "ITM-0042", name: "Brass desk lamp" } };

describe("toolViewsOf", () => {
  it("marks a call running while its input streams, with the input as far as it has come", () => {
    const streaming = toolPart("input-streaming", { input: { itemId: "ITM" } });
    expect(toolViewsOf(answer(streaming))).toEqual([
      { ...BASE, input: { itemId: "ITM" }, state: "running" },
    ]);
    expect(toolViewsOf(answer(toolPart("input-streaming", { input: undefined })))).toEqual([
      { ...BASE, input: undefined, state: "running" },
    ]);
  });

  it("marks a call running once its input is complete and until its output arrives", () => {
    expect(toolViewsOf(answer(toolPart("input-available")))).toEqual([
      { ...BASE, state: "running" },
    ]);
  });

  it("marks a call done with its output", () => {
    expect(toolViewsOf(answer(toolPart("output-available", { output: OUTPUT })))).toEqual([
      { ...BASE, output: OUTPUT, state: "done" },
    ]);
  });

  it("keeps a call running while its output is only preliminary", () => {
    const preliminary = toolPart("output-available", { output: OUTPUT, preliminary: true });
    expect(toolViewsOf(answer(preliminary))).toEqual([
      { ...BASE, output: OUTPUT, state: "running" },
    ]);
  });

  it("marks a failed call as an error, with the tool's error text", () => {
    const failed = toolPart("output-error", { errorText: "The item service is down." });
    expect(toolViewsOf(answer(failed))).toEqual([
      { ...BASE, error: "The item service is down.", state: "error" },
    ]);
  });

  it("marks a call waiting for the visitor's approval", () => {
    const requested = toolPart("approval-requested", { approval: { id: "approval-1" } });
    expect(toolViewsOf(answer(requested))).toEqual([{ ...BASE, state: "awaiting-approval" }]);
  });

  it("marks an approved call running, and a refused one denied, before the server answers", () => {
    const approved = toolPart("approval-responded", {
      approval: { id: "approval-1", approved: true },
    });
    const refused = toolPart("approval-responded", {
      approval: { id: "approval-1", approved: false, reason: "Not now." },
    });
    expect(toolViewsOf(answer(approved))).toEqual([{ ...BASE, state: "running" }]);
    expect(toolViewsOf(answer(refused))).toEqual([{ ...BASE, state: "denied" }]);
  });

  // A denied call never runs, so it must never spin as "running" (the state a denied call had
  // before the approval states existed).
  it("marks a denied call denied, a final state with no output and no error", () => {
    const denied = toolPart("output-denied", {
      approval: { id: "approval-1", approved: false },
    });
    const [view] = toolViewsOf(answer(denied));
    expect(view).toEqual({ ...BASE, state: "denied" });
    expect(view).not.toHaveProperty("output");
    expect(view).not.toHaveProperty("error");
  });

  it("reads dynamic tool parts by their tool name", () => {
    const dynamic = {
      type: "dynamic-tool",
      toolName: "search",
      toolCallId: "call-2",
      state: "output-available",
      input: { query: "lamps" },
      output: [],
    };
    expect(toolViewsOf(answer(dynamic))).toEqual([
      { id: "call-2", name: "search", input: { query: "lamps" }, output: [], state: "done" },
    ]);
  });

  it("keeps the calls in order and skips every other part", () => {
    const parts = [
      { type: "step-start" },
      toolPart("output-available", { output: OUTPUT }),
      { type: "step-start" },
      { type: "text", text: "Item ITM-0042 is available." },
      { ...toolPart("input-available"), toolCallId: "call-3" },
    ];
    expect(toolViewsOf(answer(...parts)).map(({ id, state }) => [id, state])).toEqual([
      ["call-1", "done"],
      ["call-3", "running"],
    ]);
  });

  it("gives an answer with no tool part no view", () => {
    expect(toolViewsOf(answer({ type: "text", text: "Hi" }))).toEqual([]);
    expect(toolViewsOf(answer())).toEqual([]);
  });

  // The record an eval run keeps is the view itself, so it must survive a JSON round trip.
  it("gives views that survive JSON as they are", () => {
    const views: ToolView[] = toolViewsOf(
      answer(
        toolPart("output-available", { output: OUTPUT }),
        { ...toolPart("output-error", { errorText: "boom" }), toolCallId: "call-2" },
        {
          ...toolPart("output-denied", { approval: { id: "x", approved: false } }),
          toolCallId: "call-3",
        },
      ),
    );
    expect(JSON.parse(JSON.stringify(views))).toEqual(views);
  });
});

describe("settledViews", () => {
  // The SDK leaves a tool part as it was when a Stop, an error or a timeout ends the request, so
  // a call still running then never finishes: the chip must stop spinning.
  it("shows a call still running when the answer is over as interrupted, with what it had", () => {
    const running = toolViewsOf(
      answer(
        toolPart("input-streaming", { input: { itemId: "ITM" } }),
        { ...toolPart("input-available"), toolCallId: "call-2" },
        {
          ...toolPart("approval-responded", { approval: { id: "x", approved: true } }),
          toolCallId: "call-3",
        },
        {
          ...toolPart("output-available", { output: OUTPUT, preliminary: true }),
          toolCallId: "call-4",
        },
      ),
    );
    expect(running.map(({ state }) => state)).toEqual(["running", "running", "running", "running"]);
    expect(settledViews(running)).toEqual([
      { ...BASE, input: { itemId: "ITM" }, state: "interrupted" },
      { ...BASE, id: "call-2", state: "interrupted" },
      { ...BASE, id: "call-3", state: "interrupted" },
      { ...BASE, id: "call-4", output: OUTPUT, state: "interrupted" },
    ]);
  });

  it("leaves every other state as it is", () => {
    const views = toolViewsOf(
      answer(
        toolPart("output-available", { output: OUTPUT }),
        { ...toolPart("output-error", { errorText: "boom" }), toolCallId: "call-2" },
        {
          ...toolPart("output-denied", { approval: { id: "x", approved: false } }),
          toolCallId: "call-3",
        },
        { ...toolPart("approval-requested", { approval: { id: "y" } }), toolCallId: "call-4" },
      ),
    );
    expect(settledViews(views)).toEqual(views);
  });
});

describe("stringField", () => {
  it("reads a string field of an input or output, and nothing else", () => {
    expect(stringField({ itemId: "ITM-0042" }, "itemId")).toBe("ITM-0042");
    expect(stringField({ itemId: 42 }, "itemId")).toBeUndefined();
    expect(stringField({}, "itemId")).toBeUndefined();
    expect(stringField(undefined, "itemId")).toBeUndefined();
    expect(stringField(null, "itemId")).toBeUndefined();
    expect(stringField("ITM-0042", "itemId")).toBeUndefined();
  });
});

import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { messageText } from "./message-text";

// A message's text as the screens show it (template spec §5.10): the live chat, the history the
// chat route sends the model and a recorded answer read it the same way.

function message(role: "user" | "assistant", ...parts: Record<string, unknown>[]): UIMessage {
  return { id: "m", role, parts } as unknown as UIMessage;
}

const CALL = {
  type: "tool-lookUpItem",
  toolCallId: "call-1",
  state: "output-available",
  input: { itemId: "ITM-0042" },
  output: { found: true },
};

describe("messageText", () => {
  it("joins one step's text parts as they are, and skips every other part", () => {
    const answer = message(
      "assistant",
      { type: "step-start" },
      { type: "text", text: "Hello " },
      { type: "reasoning", text: "hidden" },
      { type: "text", text: "world" },
    );
    expect(messageText(answer)).toBe("Hello world");
  });

  // Each model call of an answer is a step, and each step's text is its own text part: a model
  // that says what it will look up, calls the tool, then answers.
  it("puts a blank line between the texts of two steps", () => {
    const answer = message(
      "assistant",
      { type: "step-start" },
      { type: "text", text: "I'll look that up." },
      CALL,
      { type: "step-start" },
      { type: "text", text: "Item ITM-0042 (Brass desk lamp) is available." },
    );
    expect(messageText(answer)).toBe(
      "I'll look that up.\n\nItem ITM-0042 (Brass desk lamp) is available.",
    );
  });

  it("skips a step with no text, so no blank line leads or trails", () => {
    expect(
      messageText(
        message(
          "assistant",
          { type: "step-start" },
          CALL,
          { type: "step-start" },
          { type: "text", text: "Done." },
        ),
      ),
    ).toBe("Done.");
    // A step whose text part has just started, with no delta yet.
    expect(
      messageText(
        message(
          "assistant",
          { type: "step-start" },
          { type: "text", text: "First." },
          CALL,
          { type: "step-start" },
          { type: "text", text: "" },
        ),
      ),
    ).toBe("First.");
    expect(messageText(message("assistant", { type: "step-start" }))).toBe("");
    expect(messageText(message("assistant"))).toBe("");
  });

  it("reads a message with no step-start, such as a user's, as one step", () => {
    expect(
      messageText(message("user", { type: "text", text: "a " }, { type: "text", text: "b" })),
    ).toBe("a b");
  });
});

import { APICallError, type ChatStatus, type UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  announcement,
  annotateFinish,
  describeChatError,
  hasTextOrTools,
  hasVisibleText,
  isBusy,
  isComposingKey,
  isSendDoubleClick,
  regenerateSlot,
  SEND_DOUBLE_CLICK_MS,
  shouldSubmitOnKey,
  showsAssistant,
  showTypingIndicator,
} from "./ui";

function user(id: string, text: string): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

/** Shaped like a streamed assistant message: a step-start part, then text. */
function assistant(id: string, text: string): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "step-start" }, { type: "text", text, state: "done" }],
  };
}

/** An assistant step that holds only a tool call: no text, but something a renderer can show. */
function toolOnly(id: string): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [
      { type: "step-start" },
      {
        type: "dynamic-tool",
        toolName: "search",
        toolCallId: "call-1",
        state: "input-available",
        input: { query: "streaming" },
      },
    ],
  };
}

/** A project's content predicate: text, or any tool part (X-01 design §4.3). */
function textOrTool(message: UIMessage): boolean {
  return hasVisibleText(message) || message.parts.some((part) => part.type === "dynamic-tool");
}

function apiCallError(statusCode: number, message = "Server says no."): APICallError {
  return new APICallError({
    message,
    url: "/api/chat",
    requestBodyValues: undefined,
    statusCode,
    responseBody: message,
  });
}

const BUSY: ChatStatus[] = ["submitted", "streaming"];
const IDLE: ChatStatus[] = ["ready", "error"];

// How a message's text parts join is lib/trace/message-text.test.ts's.
describe("hasVisibleText", () => {
  it("treats empty, whitespace-only and text-less messages as not visible", () => {
    expect(hasVisibleText(assistant("a", ""))).toBe(false);
    expect(hasVisibleText(assistant("a", "  \n\t"))).toBe(false);
    expect(hasVisibleText({ id: "a", role: "assistant", parts: [] })).toBe(false);
    expect(hasVisibleText({ id: "a", role: "assistant", parts: [{ type: "step-start" }] })).toBe(
      false,
    );
    expect(hasVisibleText(toolOnly("a"))).toBe(false);
    expect(hasVisibleText(assistant("a", " x "))).toBe(true);
  });
});

describe("hasTextOrTools", () => {
  /** A step that holds only a call to one of the route's own tools: a tool-<name> part. */
  const staticToolOnly: UIMessage = {
    id: "a",
    role: "assistant",
    parts: [
      { type: "step-start" },
      {
        type: "tool-lookUpItem",
        toolCallId: "call-1",
        state: "output-available",
        input: { itemId: "ITM-0042" },
        output: { found: false, itemId: "ITM-0042" },
      },
    ],
  };

  it("counts visible text, or any tool call, as something to show", () => {
    expect(hasTextOrTools(assistant("a", "Hello"))).toBe(true);
    expect(hasTextOrTools(toolOnly("a"))).toBe(true);
    expect(hasTextOrTools(staticToolOnly)).toBe(true);
  });

  it("counts neither whitespace nor a bare step as something to show", () => {
    expect(hasTextOrTools(assistant("a", " \n"))).toBe(false);
    expect(hasTextOrTools({ id: "a", role: "assistant", parts: [{ type: "step-start" }] })).toBe(
      false,
    );
    expect(hasTextOrTools({ id: "a", role: "assistant", parts: [] })).toBe(false);
  });

  it("shows a tool-only step where hasVisibleText hides it", () => {
    expect(showsAssistant(toolOnly("a"), hasTextOrTools)).toBe(true);
    expect(
      showTypingIndicator([user("u1", "hi"), toolOnly("a")], "streaming", hasTextOrTools),
    ).toBe(false);
  });
});

describe("isBusy", () => {
  it("is true only while submitted or streaming", () => {
    for (const status of BUSY) expect(isBusy(status)).toBe(true);
    for (const status of IDLE) expect(isBusy(status)).toBe(false);
  });
});

describe("annotateFinish", () => {
  const u = user("u1", "hi");

  it("marks a user Stop as stopped, not interrupted", () => {
    const message = assistant("a1", "partial");
    expect(
      annotateFinish({
        message,
        messages: [u, message],
        isAbort: true,
        isError: false,
        finishReason: undefined,
      }),
    ).toEqual({ id: "a1", stopped: true, cutOff: false, interrupted: false });
  });

  it("marks finishReason 'length' as cut off", () => {
    const message = assistant("a1", "long answer");
    expect(
      annotateFinish({
        message,
        messages: [u, message],
        isAbort: false,
        isError: false,
        finishReason: "length",
      }),
    ).toEqual({ id: "a1", stopped: false, cutOff: true, interrupted: false });
  });

  it("marks no abort, no error and no finishReason as interrupted (timeout)", () => {
    const message = assistant("a1", "partial");
    expect(
      annotateFinish({
        message,
        messages: [u, message],
        isAbort: false,
        isError: false,
        finishReason: undefined,
      }),
    ).toEqual({ id: "a1", stopped: false, cutOff: false, interrupted: true });
  });

  it("is interrupted also when the message never reached messages (empty parts)", () => {
    expect(
      annotateFinish({
        message: { id: "fresh", role: "assistant", parts: [] },
        messages: [u],
        isAbort: false,
        isError: false,
        finishReason: undefined,
      }),
    ).toEqual({ id: null, stopped: false, cutOff: false, interrupted: true });
  });

  it("returns id null for a message absent from messages (nothing but `start` streamed)", () => {
    expect(
      annotateFinish({
        message: { id: "fresh", role: "assistant", parts: [] },
        messages: [u],
        isAbort: true,
        isError: false,
        finishReason: undefined,
      }),
    ).toEqual({ id: null, stopped: true, cutOff: false, interrupted: false });
  });

  it("is neither stopped nor interrupted on an error or a normal finish", () => {
    const message = assistant("a1", "text");
    expect(
      annotateFinish({
        message,
        messages: [u, message],
        isAbort: false,
        isError: true,
        finishReason: undefined,
      }),
    ).toEqual({ id: "a1", stopped: false, cutOff: false, interrupted: false });
    expect(
      annotateFinish({
        message,
        messages: [u, message],
        isAbort: false,
        isError: false,
        finishReason: "stop",
      }),
    ).toEqual({ id: "a1", stopped: false, cutOff: false, interrupted: false });
  });
});

describe("shouldSubmitOnKey", () => {
  it("submits on Enter only", () => {
    expect(shouldSubmitOnKey({ key: "Enter", shiftKey: false, isComposing: false })).toBe(true);
  });

  it("does not submit on Shift+Enter", () => {
    expect(shouldSubmitOnKey({ key: "Enter", shiftKey: true, isComposing: false })).toBe(false);
  });

  it("does not submit while an IME composition is active", () => {
    expect(shouldSubmitOnKey({ key: "Enter", shiftKey: false, isComposing: true })).toBe(false);
  });

  it("does not submit on other keys", () => {
    expect(shouldSubmitOnKey({ key: "a", shiftKey: false, isComposing: false })).toBe(false);
  });
});

// An IME (Chinese, Japanese, Korean input) composes a word over several keys. Safari fires
// compositionend before the keydown of the Enter or Esc that ended the composition, and sends that
// keydown with keyCode 229 and isComposing false (template spec §5.8).
describe("isComposingKey", () => {
  it("is false for a plain key outside any composition", () => {
    expect(isComposingKey({ isComposing: false, keyCode: 13 }, false)).toBe(false);
    expect(isComposingKey({ isComposing: false, keyCode: 27 }, false)).toBe(false);
  });

  it("is true for a key the browser marks as composing", () => {
    expect(isComposingKey({ isComposing: true, keyCode: 13 }, false)).toBe(true);
  });

  it("is true for any key inside a composition the page saw start", () => {
    expect(isComposingKey({ isComposing: false, keyCode: 13 }, true)).toBe(true);
  });

  it("is true for keyCode 229, the key that ends a composition in Safari", () => {
    expect(isComposingKey({ isComposing: false, keyCode: 229 }, false)).toBe(true);
  });

  it("keeps Enter from sending in each of those cases", () => {
    const enter = (isComposing: boolean) =>
      shouldSubmitOnKey({ key: "Enter", shiftKey: false, isComposing });
    expect(enter(isComposingKey({ isComposing: false, keyCode: 229 }, false))).toBe(false);
    expect(enter(isComposingKey({ isComposing: false, keyCode: 13 }, true))).toBe(false);
    expect(enter(isComposingKey({ isComposing: false, keyCode: 13 }, false))).toBe(true);
  });
});

// The second click of a double-click on Send lands on Stop once the button swaps. Only that click
// is ignored: one past the first of its chain (detail > 1), within SEND_DOUBLE_CLICK_MS of the send.
describe("isSendDoubleClick", () => {
  it("ignores the rest of a double-click on Send, right after the send", () => {
    expect(isSendDoubleClick({ detail: 2, msSinceSend: 120 })).toBe(true);
    expect(isSendDoubleClick({ detail: 3, msSinceSend: SEND_DOUBLE_CLICK_MS - 1 })).toBe(true);
  });

  it("lets a click in the same chain stop once the guard's time is over", () => {
    expect(isSendDoubleClick({ detail: 2, msSinceSend: SEND_DOUBLE_CLICK_MS })).toBe(false);
    expect(isSendDoubleClick({ detail: 2, msSinceSend: 1500 })).toBe(false);
  });

  it("lets a single click or a keyboard press stop at once", () => {
    expect(isSendDoubleClick({ detail: 1, msSinceSend: 50 })).toBe(false);
    // Enter or Space on a focused button gives a click with detail 0.
    expect(isSendDoubleClick({ detail: 0, msSinceSend: 50 })).toBe(false);
  });

  it("lets every click stop when the composer has not sent", () => {
    expect(isSendDoubleClick({ detail: 2, msSinceSend: null })).toBe(false);
  });

  it("lasts about half a second", () => {
    expect(SEND_DOUBLE_CLICK_MS).toBe(500);
  });
});

describe("describeChatError", () => {
  it("maps an APICallError with status 429 to the limit banner", () => {
    expect(describeChatError(apiCallError(429, "Demo limit reached."))).toBe("limit");
  });

  it("maps everything else to the generic banner", () => {
    expect(describeChatError(new TypeError("Failed to fetch"))).toBe("generic");
    expect(describeChatError(apiCallError(500, "<html>boom</html>"))).toBe("generic");
    expect(describeChatError(apiCallError(400, "Bad request."))).toBe("generic");
    expect(describeChatError(new Error("An error occurred."))).toBe("generic");
    expect(describeChatError(undefined)).toBe("generic");
  });

  it("never branches on message text", () => {
    expect(describeChatError(new Error("429 Too Many Requests"))).toBe("generic");
    expect(describeChatError(apiCallError(500, "429"))).toBe("generic");
  });
});

describe("regenerateSlot", () => {
  const u = user("u1", "hi");

  it("puts Regenerate after a final assistant answer with text", () => {
    expect(regenerateSlot([u, assistant("a1", "text")], "ready", false)).toBe("after-answer");
    expect(regenerateSlot([u, assistant("a1", "text")], "ready", true)).toBe("after-answer");
    expect(regenerateSlot([u, assistant("a1", "partial")], "error", false)).toBe("after-answer");
  });

  it("uses the stopped row when the user stopped before any visible text", () => {
    expect(regenerateSlot([u], "ready", true)).toBe("stopped-row");
    expect(regenerateSlot([u, assistant("a1", "")], "ready", true)).toBe("stopped-row");
    expect(regenerateSlot([u, assistant("a1", "  ")], "ready", true)).toBe("stopped-row");
  });

  it("shows nothing for those cases without a user Stop (timeout, error)", () => {
    expect(regenerateSlot([u], "ready", false)).toBeNull();
    expect(regenerateSlot([u, assistant("a1", "")], "ready", false)).toBeNull();
    expect(regenerateSlot([u, assistant("a1", "  ")], "ready", false)).toBeNull();
    expect(regenerateSlot([u], "error", false)).toBeNull();
  });

  it("shows nothing while busy", () => {
    for (const status of BUSY) {
      expect(regenerateSlot([u], status, true)).toBeNull();
      expect(regenerateSlot([u, assistant("a1", "text")], status, false)).toBeNull();
    }
  });

  it("shows nothing for an empty chat", () => {
    expect(regenerateSlot([], "ready", true)).toBeNull();
  });

  // The list hides what the predicate calls empty, so the slot must follow the same predicate.
  it("reads a final message through hasContent", () => {
    const tool = toolOnly("a1");
    // By default a tool-only step has no visible text: the list hides it.
    expect(regenerateSlot([u, tool], "ready", true)).toBe("stopped-row");
    expect(regenerateSlot([u, tool], "ready", false)).toBeNull();
    // A project whose renderer shows tool parts passes a predicate that counts them.
    expect(regenerateSlot([u, tool], "ready", false, textOrTool)).toBe("after-answer");
    expect(regenerateSlot([u, tool], "ready", true, textOrTool)).toBe("after-answer");
    // And a predicate stricter than the default hides text the default would show.
    const never = () => false;
    expect(regenerateSlot([u, assistant("a1", "text")], "ready", true, never)).toBe("stopped-row");
  });
});

describe("showTypingIndicator", () => {
  const u = user("u1", "hi");

  it("shows while submitted", () => {
    expect(showTypingIndicator([u], "submitted")).toBe(true);
    expect(showTypingIndicator([u, assistant("old", "old answer")], "submitted")).toBe(true);
  });

  it("shows while streaming until the new assistant message has visible text", () => {
    expect(showTypingIndicator([u, assistant("a1", "")], "streaming")).toBe(true);
    expect(showTypingIndicator([u, assistant("a1", " ")], "streaming")).toBe(true);
    expect(showTypingIndicator([u, assistant("a1", "Hi")], "streaming")).toBe(false);
  });

  it("hides when idle", () => {
    for (const status of IDLE) expect(showTypingIndicator([u], status)).toBe(false);
  });

  it("reads the streaming message through hasContent", () => {
    expect(showTypingIndicator([u, toolOnly("a1")], "streaming")).toBe(true);
    expect(showTypingIndicator([u, toolOnly("a1")], "streaming", textOrTool)).toBe(false);
    // Submitted shows the dots whatever the predicate says.
    expect(showTypingIndicator([u, toolOnly("a1")], "submitted", textOrTool)).toBe(true);
  });

  /**
   * An answer whose first step called the sample tool, with the call in `state`, and whose next
   * step has started with `text` (none yet by default).
   */
  function afterCall(
    state: "input-available" | "output-available" | "output-error",
    text = "",
  ): UIMessage {
    const call = {
      type: "tool-lookUpItem" as const,
      toolCallId: "call-1",
      input: { itemId: "ITM-0042" },
    };
    return {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        state === "output-available"
          ? { ...call, state, output: { found: true } }
          : state === "output-error"
            ? { ...call, state, errorText: "The service is down." }
            : { ...call, state },
        { type: "step-start" },
        ...(text === "" ? [] : [{ type: "text" as const, text, state: "streaming" as const }]),
      ],
    };
  }

  // Once a call is over, its chip no longer moves, and the next step's first word may be seconds
  // away: the dots show until it comes, even though the chip counts as content (template spec
  // §5.10).
  it("shows again while streaming when the answer has no text and none of its calls runs", () => {
    expect(
      showTypingIndicator([u, afterCall("output-available")], "streaming", hasTextOrTools),
    ).toBe(true);
    expect(showTypingIndicator([u, afterCall("output-error")], "streaming", hasTextOrTools)).toBe(
      true,
    );
  });

  it("hides while a call runs, whose chip spins, and once the answer has text", () => {
    expect(
      showTypingIndicator([u, afterCall("input-available")], "streaming", hasTextOrTools),
    ).toBe(false);
    expect(
      showTypingIndicator(
        [u, afterCall("output-available", "Item ITM-0042 is available.")],
        "streaming",
        hasTextOrTools,
      ),
    ).toBe(false);
    // Idle, nothing is coming.
    for (const status of IDLE) {
      expect(showTypingIndicator([u, afterCall("output-available")], status, hasTextOrTools)).toBe(
        false,
      );
    }
  });
});

describe("announcement", () => {
  const u = user("u1", "hi");
  const idle = { status: "ready" as const, failed: false, stoppedByUser: false };

  it("says nothing while a request is in flight, whatever else holds", () => {
    for (const status of BUSY) {
      expect(
        announcement({
          messages: [u, assistant("a1", "text")],
          status,
          failed: true,
          stoppedByUser: true,
        }),
      ).toBeNull();
    }
  });

  it("announces a completed answer", () => {
    expect(announcement({ ...idle, messages: [u, assistant("a1", "text")] })).toBe("complete");
  });

  it("announces a failure before a Stop, and a Stop before a complete answer", () => {
    const answered = [u, assistant("a1", "partial")];
    expect(announcement({ ...idle, messages: answered, failed: true, stoppedByUser: true })).toBe(
      "failed",
    );
    expect(announcement({ ...idle, messages: [u], status: "error", failed: true })).toBe("failed");
    expect(announcement({ ...idle, messages: answered, stoppedByUser: true })).toBe("stopped");
    expect(announcement({ ...idle, messages: [u], stoppedByUser: true })).toBe("stopped");
  });

  it("says nothing for an empty chat or a final message with nothing to show", () => {
    expect(announcement({ ...idle, messages: [] })).toBeNull();
    expect(announcement({ ...idle, messages: [u] })).toBeNull();
    expect(announcement({ ...idle, messages: [u, assistant("a1", " ")] })).toBeNull();
  });

  it("reads the final message through hasContent", () => {
    const messages = [u, toolOnly("a1")];
    expect(announcement({ ...idle, messages })).toBeNull();
    expect(announcement({ ...idle, messages }, textOrTool)).toBe("complete");
  });
});

// A predicate typed on a project's own message type is accepted as it is (X-01 design §4.3):
// typecheck fails here if a helper takes `(message: UIMessage) => boolean` instead.
describe("showsAssistant", () => {
  // The list's filter, the fourth use of the content predicate (X-01 design §4.3).
  it("shows an assistant message with text, and never a user message", () => {
    expect(showsAssistant(assistant("a1", "Hello"))).toBe(true);
    expect(showsAssistant(user("u1", "Hello"))).toBe(false);
  });

  it("hides an assistant message with nothing to show: Stop before the first token", () => {
    expect(showsAssistant(assistant("a1", ""))).toBe(false);
  });

  it("hides a tool-only step by default, and shows it with a project's predicate", () => {
    expect(showsAssistant(toolOnly("a1"))).toBe(false);
    expect(showsAssistant(toolOnly("a1"), textOrTool)).toBe(true);
  });
});

describe("the helpers are generic over the message type", () => {
  type NotedMessage = UIMessage<{ note?: string }>;
  const noted = (message: NotedMessage) => message.metadata?.note !== undefined;
  // No text: only the predicate can tell that this answer has content.
  const answer: NotedMessage = {
    id: "a1",
    role: "assistant",
    parts: [{ type: "step-start" }],
    metadata: { note: "from a tool" },
  };
  const question: NotedMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] };
  // Text, but no note: only the predicate can tell that this answer has nothing to show yet.
  const unnoted: NotedMessage = {
    id: "a1",
    role: "assistant",
    parts: [{ type: "step-start" }, { type: "text", text: "Looking.", state: "streaming" }],
  };

  it("take the project's predicate with the project's messages", () => {
    expect(regenerateSlot([question, answer], "ready", false, noted)).toBe("after-answer");
    // The default hides the dots under this text; the predicate hides the answer, so they show.
    expect(showTypingIndicator([question, unnoted], "streaming")).toBe(false);
    expect(showTypingIndicator([question, unnoted], "streaming", noted)).toBe(true);
    expect(showsAssistant(answer, noted)).toBe(true);
    expect(
      announcement(
        { messages: [question, answer], status: "ready", failed: false, stoppedByUser: false },
        noted,
      ),
    ).toBe("complete");
  });
});

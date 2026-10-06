import {
  APICallError,
  type ChatOnFinishCallback,
  type ChatStatus,
  isToolUIPart,
  type UIMessage,
} from "ai";
import { messageText } from "@/lib/trace/message-text";
import { toolViewsOf } from "@/lib/trace/tool-view";

/**
 * Pure helpers of the chat shell (X-01 design §4.2, §4.3). The ones that decide whether a message
 * has something to show take an optional `hasContent` predicate, the same one the message list
 * filters with, and are generic over the message type: under `strict`, a predicate typed on a
 * project's own message type could not be passed where one on UIMessage is expected.
 */

/** The payload useChat passes to `onFinish` (ai 7: message, messages, isAbort, isDisconnect, isError, finishReason). */
export type ChatFinishEvent = Parameters<ChatOnFinishCallback<UIMessage>>[0];

export type FinishAnnotation = {
  /**
   * The finished message's id, or null when that message never reached `messages`: a failed
   * request, or a Stop before the first chunk that adds it. A message that did reach `messages`
   * may still have nothing to show (a step-start part and no text, say): the list hides it and
   * regenerateSlot gives "stopped-row". The chat annotates only non-null ids.
   */
  id: string | null;
  /** The user pressed Stop or Esc. */
  stopped: boolean;
  /** The answer hit the output-token cap (`finishReason === 'length'`). */
  cutOff: boolean;
  /** No abort, no error and no finish reason: a server timeout. */
  interrupted: boolean;
};

export type ChatErrorKind = "limit" | "generic";

export type RegenerateSlot = "after-answer" | "stopped-row" | null;

/** What the screen-reader status line says; each value is a key of the `status` strings. */
export type Announcement = "complete" | "stopped" | "failed";

/** True while a request is in flight. */
export function isBusy(status: ChatStatus): boolean {
  return status === "submitted" || status === "streaming";
}

/**
 * True when the message has at least one non-whitespace text character: the `hasContent` of a
 * renderer that shows text only, and the default of the helpers below. Chat's default follows its
 * renderer (defaultHasContent): hasTextOrTools with the default renderer, which shows the chips.
 */
export function hasVisibleText(message: UIMessage): boolean {
  return messageText(message).trim() !== "";
}

/**
 * True when the message has visible text or a tool call: the `hasContent` of a renderer that shows
 * a chip for each tool call (template spec §5.10), so an answer shows its call while the tool runs,
 * before any text.
 */
export function hasTextOrTools(message: UIMessage): boolean {
  return hasVisibleText(message) || message.parts.some(isToolUIPart);
}

/**
 * Turns useChat's `onFinish` payload into the chat's annotations. `message` is never undefined:
 * when nothing was streamed it is a fresh assistant message that is absent from `messages`, and
 * `id` comes back null.
 */
export function annotateFinish({
  message,
  messages,
  isAbort,
  isError,
  finishReason,
}: Pick<
  ChatFinishEvent,
  "message" | "messages" | "isAbort" | "isError" | "finishReason"
>): FinishAnnotation {
  return {
    id: messages.some((m) => m.id === message.id) ? message.id : null,
    stopped: isAbort,
    cutOff: finishReason === "length",
    interrupted: !isAbort && !isError && finishReason == null,
  };
}

/** The keyCode of a key an IME is processing. */
const IME_KEY_CODE = 229;

/**
 * Whether a key belongs to an IME composition (Chinese, Japanese or Korean input), so Enter must
 * not send and Esc must not stop (template spec §5.8): a key the browser marks as composing, any
 * key while a composition the page tracked (compositionstart to compositionend) is open, or a key
 * with keyCode 229. Safari fires compositionend before the keydown of the Enter or Esc that ended
 * the composition, and sends that keydown with keyCode 229 and isComposing false.
 */
export function isComposingKey(
  event: { isComposing: boolean; keyCode: number },
  composing: boolean,
): boolean {
  return composing || event.isComposing || event.keyCode === IME_KEY_CODE;
}

/** How long after a send the Stop button ignores the rest of a double-click on Send. */
export const SEND_DOUBLE_CLICK_MS = 500;

/**
 * Whether a click on Stop is the second click of a double-click on Send, which lands on Stop once
 * the button swaps (template spec §5.8): a click past the first of its chain (`detail` above 1)
 * within SEND_DOUBLE_CLICK_MS of the send. A later click stops, even one the browser counts in the
 * same chain; so does a single click, or a key press (`detail` 0). `msSinceSend` is null when the
 * composer has not sent.
 */
export function isSendDoubleClick({
  detail,
  msSinceSend,
}: {
  detail: number;
  msSinceSend: number | null;
}): boolean {
  return detail > 1 && msSinceSend !== null && msSinceSend < SEND_DOUBLE_CLICK_MS;
}

/** Enter sends; Shift+Enter inserts a newline; Enter during IME composition does nothing. */
export function shouldSubmitOnKey({
  key,
  shiftKey,
  isComposing,
}: {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
}): boolean {
  return key === "Enter" && !shiftKey && !isComposing;
}

/**
 * Picks the error banner. A non-2xx response makes the default transport throw an
 * `APICallError` whose `statusCode` is the HTTP status; the message text is never inspected.
 */
export function describeChatError(error: unknown): ChatErrorKind {
  return APICallError.isInstance(error) && error.statusCode === 429 ? "limit" : "generic";
}

/**
 * Where the single Regenerate button goes, or null for nowhere.
 * - "after-answer": under the final message, an assistant message with content.
 * - "stopped-row": in the "Stopped before a response" row, only after a user Stop,
 *   when the final message is a user message or an assistant message without content.
 */
export function regenerateSlot<M extends UIMessage>(
  messages: M[],
  status: ChatStatus,
  stoppedByUser: boolean,
  hasContent: (message: M) => boolean = hasVisibleText,
): RegenerateSlot {
  if (isBusy(status)) return null;
  const last = messages.at(-1);
  if (last === undefined) return null;
  if (last.role === "assistant" && hasContent(last)) return "after-answer";
  // The final message is a user message, or an assistant message with no content.
  return stoppedByUser && last.role !== "system" ? "stopped-row" : null;
}

/**
 * Whether the list shows a message as an answer: an assistant message with content. One without
 * (Stop before the first token) is not shown (X-01 design §4.3).
 */
export function showsAssistant<M extends UIMessage>(
  message: M,
  hasContent: (message: M) => boolean = hasVisibleText,
): boolean {
  return message.role === "assistant" && hasContent(message);
}

/**
 * Typing dots, which say that more of the answer is coming: while submitted, and while streaming
 * when the new answer has no content yet, or has no visible text and none of its tool calls runs
 * (template spec §5.10). A running call's chip spins and text grows, so either says it already;
 * a finished call's chip does not, and the next step's first word may be seconds away.
 */
export function showTypingIndicator<M extends UIMessage>(
  messages: M[],
  status: ChatStatus,
  hasContent: (message: M) => boolean = hasVisibleText,
): boolean {
  if (status === "submitted") return true;
  if (status !== "streaming") return false;
  const last = messages.at(-1);
  if (last === undefined || last.role !== "assistant" || !hasContent(last)) return true;
  return !hasVisibleText(last) && !toolViewsOf(last).some((view) => view.state === "running");
}

/**
 * What the polite status line announces once a request is over; tokens are never read aloud.
 * Nothing while busy. Then "failed" while an error banner shows, "stopped" after a user Stop,
 * "complete" when the final message is an assistant message with content, else null.
 */
export function announcement<M extends UIMessage>(
  {
    messages,
    status,
    failed,
    stoppedByUser,
  }: {
    messages: M[];
    status: ChatStatus;
    /** An error banner shows: a failed request or a server timeout. */
    failed: boolean;
    stoppedByUser: boolean;
  },
  hasContent: (message: M) => boolean = hasVisibleText,
): Announcement | null {
  if (isBusy(status)) return null;
  if (failed) return "failed";
  if (stoppedByUser) return "stopped";
  const last = messages.at(-1);
  return last?.role === "assistant" && hasContent(last) ? "complete" : null;
}

import {
  APICallError,
  type ChatOnFinishCallback,
  type ChatStatus,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
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
export type Announcement = "complete" | "stopped" | "failed" | "approvalNeeded";

/** What Retry does after a failed request; null when a card waits, whose answer continues. */
export type RetryAction = "continue" | "regenerate" | null;

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
 * A tool part's approval, when it has one: a server tool that needs a person's answer
 * (`toolApproval` on the server, ai 7.0.114) carries it from its card to its end. One the server
 * decided by itself carries isAutomatic and never asked anyone.
 */
function approvalOf(
  part: UIMessage["parts"][number],
): { id: string; approved?: boolean; isAutomatic?: boolean } | undefined {
  if (!isToolUIPart(part) || !("approval" in part)) return undefined;
  return part.approval ?? undefined;
}

/**
 * The approvals a person still has to answer in a message, by approval id (the id that
 * addToolApprovalResponse takes, not the call's): its cards. A decision the server took by itself
 * is never one (P2's spec §4.5).
 */
export function pendingApprovals(message: UIMessage): string[] {
  return message.parts.flatMap((part) => {
    const approval = approvalOf(part);
    return isToolUIPart(part) &&
      part.state === "approval-requested" &&
      approval !== undefined &&
      approval.isAutomatic !== true
      ? [approval.id]
      : [];
  });
}

/**
 * Whether a card waits for the person: the conversation's last message is an assistant message
 * with an approval to answer. A later message leaves a card behind, unanswered, and the history
 * drops it (P2's spec §4.3), so only the last message counts. While it waits the composer is
 * read-only and Regenerate hidden; its answer continues the same message (P2's spec §4.5).
 */
export function awaitsApproval<M extends UIMessage>(messages: M[]): boolean {
  const last = messages.at(-1);
  return last?.role === "assistant" && pendingApprovals(last).length > 0;
}

/**
 * Whether a message holds a person's approval: a card that waits, one answered, or the call it
 * decided, run or refused. Regenerate replaces the last answer, so under such a message it would
 * erase a decision from the conversation, which is the audit log (P2's spec §2, §4.5).
 */
export function holdsApproval(message: UIMessage): boolean {
  return message.parts.some((part) => {
    const approval = approvalOf(part);
    return approval !== undefined && approval.isAutomatic !== true;
  });
}

/**
 * What Retry does after a failed request (P2's spec §4.5). A request that continued after an
 * answer (a 429, a lost connection, a timeout) leaves the answer, or the call it ran, in the last
 * message: Retry continues that message, so nothing the person decided is dropped. While a card
 * waits there is nothing to retry: its answer continues the conversation. Otherwise Retry
 * regenerates, as it always did.
 */
export function retryAction<M extends UIMessage>(messages: M[]): RetryAction {
  if (awaitsApproval(messages)) return null;
  const last = messages.at(-1);
  return last?.role === "assistant" && holdsApproval(last) ? "continue" : "regenerate";
}

/**
 * Whether the chat is about to continue on its own: idle, with every card of the last message's
 * last step answered (useChat's sendAutomaticallyWhen,
 * lastAssistantMessageIsCompleteWithApprovalResponses). Between the answer and that request
 * useChat is ready for a moment, so the answer's calls still count as running rather than
 * settling as not finished. Never after a Stop or an error: useChat sends nothing then.
 */
export function continuesAutomatically<M extends UIMessage>(
  messages: M[],
  status: ChatStatus,
  stoppedByUser: boolean,
): boolean {
  return (
    status === "ready" &&
    !stoppedByUser &&
    lastAssistantMessageIsCompleteWithApprovalResponses({ messages })
  );
}

/**
 * Where the single Regenerate button goes, or null for nowhere.
 * - "after-answer": under the final message, an assistant message with content.
 * - "stopped-row": in the "Stopped before a response" row, only after a user Stop,
 *   when the final message is a user message or an assistant message without content.
 * Never under a message that holds a person's approval (holdsApproval).
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
  if (last.role === "assistant" && holdsApproval(last)) return null;
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
 * "approvalNeeded" while a card waits (P2's spec §4.5), "complete" when the final message is an
 * assistant message with content, else null.
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
  if (awaitsApproval(messages)) return "approvalNeeded";
  const last = messages.at(-1);
  return last?.role === "assistant" && hasContent(last) ? "complete" : null;
}

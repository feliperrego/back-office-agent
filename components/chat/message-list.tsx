import type { ChatStatus, UIMessage } from "ai";
import { Fragment, type ReactNode } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { isBusy, showsAssistant, showTypingIndicator, type RegenerateSlot } from "@/lib/chat/ui";
import { messageText } from "@/lib/trace/message-text";

/** What onFinish recorded for a message id. */
export type MessageAnnotation = { stopped: boolean; cutOff: boolean };

export type AssistantRenderOptions = {
  /** The message is still streaming. */
  streaming: boolean;
  /** The caption row (Stopped, Cut, Regenerate), or null. The renderer places it last. */
  caption: ReactNode;
};

/**
 * Renders one assistant message. The contract (X-01 design §4.3): the root carries
 * data-message-role="assistant", its first child div is the answer text, and `caption` goes last.
 */
export type AssistantRenderer<M extends UIMessage> = (
  message: M,
  options: AssistantRenderOptions,
) => ReactNode;

type MessageListProps<M extends UIMessage> = {
  /** The element that grows while streaming; useStickToBottom observes it. */
  contentRef: (element: HTMLElement | null) => void;
  messages: M[];
  status: ChatStatus;
  annotations: ReadonlyMap<string, MessageAnnotation>;
  /** Where the single Regenerate button goes: regenerateSlot() in lib/chat/ui.ts. */
  slot: RegenerateSlot;
  onRegenerate: () => void;
  renderAssistant: AssistantRenderer<M>;
  /** Whether an assistant message has anything to show; the same predicate as the slot's. */
  hasContent: (message: M) => boolean;
};

const REGENERATE_CLASS = "h-auto px-0 py-1 pointer-coarse:min-h-11";

/**
 * The conversation (X-01 design §4.3): the user's messages as plain text, each assistant message
 * through `renderAssistant` with its caption row, the typing dots and the stopped row.
 */
export function MessageList<M extends UIMessage>({
  contentRef,
  messages,
  status,
  annotations,
  slot,
  onRegenerate,
  renderAssistant,
  hasContent,
}: MessageListProps<M>) {
  const { t } = useLocale();
  const lastId = messages.at(-1)?.id;
  const busy = isBusy(status);

  return (
    <div
      ref={contentRef}
      role="log"
      aria-label={t.list.label}
      aria-busy={busy}
      className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6"
    >
      {messages.map((message) => {
        if (message.role === "user") {
          return (
            <div
              key={message.id}
              data-message-role="user"
              className="ml-auto max-w-[85%] rounded-2xl bg-muted px-4 py-2 whitespace-pre-wrap wrap-anywhere"
            >
              {messageText(message)}
            </div>
          );
        }
        if (!showsAssistant(message, hasContent)) return null;

        const annotation = annotations.get(message.id);
        const showRegenerate = message.id === lastId && slot === "after-answer";
        const hasMeta = annotation?.stopped || annotation?.cutOff || showRegenerate;
        const caption = hasMeta ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {annotation?.stopped && <span>{t.list.stopped}</span>}
            {annotation?.cutOff && <span>{t.list.cutOff}</span>}
            {showRegenerate && (
              <Button variant="link" size="sm" className={REGENERATE_CLASS} onClick={onRegenerate}>
                {t.list.regenerate}
              </Button>
            )}
          </div>
        ) : null;

        return (
          <Fragment key={message.id}>
            {renderAssistant(message, { streaming: busy && message.id === lastId, caption })}
          </Fragment>
        );
      })}

      {showTypingIndicator(messages, status, hasContent) && (
        <div
          data-testid="typing-indicator"
          aria-hidden="true"
          className="flex h-6 items-center gap-1"
        >
          <span className="size-2 rounded-full bg-muted-foreground/60 motion-safe:animate-bounce motion-safe:[animation-delay:-0.3s]" />
          <span className="size-2 rounded-full bg-muted-foreground/60 motion-safe:animate-bounce motion-safe:[animation-delay:-0.15s]" />
          <span className="size-2 rounded-full bg-muted-foreground/60 motion-safe:animate-bounce" />
        </div>
      )}

      {slot === "stopped-row" && (
        <div data-testid="stopped-row" className="text-sm text-muted-foreground">
          {t.list.stoppedBefore}{" "}
          <Button variant="link" size="sm" className={REGENERATE_CLASS} onClick={onRegenerate}>
            {t.list.regenerate}
          </Button>
        </div>
      )}
    </div>
  );
}

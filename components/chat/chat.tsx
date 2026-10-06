"use client";

import { useChat } from "@ai-sdk/react";
import type { ChatTransport, UIMessage } from "ai";
import { ArrowDown, Plus } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Composer } from "@/components/chat/composer";
import { EmptyState, type EmptyStateContent } from "@/components/chat/empty-state";
import {
  MessageList,
  type AssistantRenderer,
  type MessageAnnotation,
} from "@/components/chat/message-list";
import { renderPlainText } from "@/components/chat/plain-text-message";
import { useLocale } from "@/components/i18n/locale-provider";
import { SiteHeader } from "@/components/site-header";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
import { MAX_MESSAGES } from "@/lib/chat/limits";
import {
  announcement,
  annotateFinish,
  describeChatError,
  hasTextOrTools,
  hasVisibleText,
  isBusy,
  isComposingKey,
  regenerateSlot,
  type ChatErrorKind,
} from "@/lib/chat/ui";
import { format } from "@/lib/i18n/format";

export type ChatProps<M extends UIMessage> = {
  modelLabel: string;
  isMock: boolean;
  /** VERCEL_GIT_COMMIT_SHA, or "local". */
  commit: string;
  /** RATE_LIMIT_PER_HOUR from lib/rate-limit.ts, so the UI never states a wrong limit. */
  rateLimitPerHour: number;
  /** The empty state's title, intro and prompt groups: the project's text, in the current locale. */
  empty: EmptyStateContent;
  /** Default: useChat's own, which POSTs the whole history to /api/chat. */
  transport?: ChatTransport<M>;
  /**
   * Most messages in one conversation; at the cap the composer locks until New chat. Defaults to
   * MAX_MESSAGES whatever the transport, so the client cap and the route's 400 come from one
   * constant: a custom transport may still post the history. A transport that posts only the
   * latest message passes null to turn the cap off (X-01 design §4.3).
   */
  maxMessages?: number | null;
  /** Default: the answer as plain text, then a chip for each tool call (PlainTextMessage). */
  renderAssistant?: AssistantRenderer<M>;
  /**
   * Whether an assistant message has anything to show. Default: what the renderer shows
   * (defaultHasContent): hasTextOrTools with the default renderer, which shows a chip for each
   * tool call, and hasVisibleText with a renderer of the project's own; a project renderer that
   * shows chips too passes hasTextOrTools (template spec §5.8). The list's filter, the Regenerate
   * slot, the typing dots and the status line all read it.
   */
  hasContent?: (message: M) => boolean;
  /**
   * What sits above the conversation, given the New chat button. Default: the site header with
   * New chat in its actions. A chat in a panel (a drawer, a docked panel) passes its own bar, so
   * the page keeps its one header[data-model] (template spec §5.8).
   */
  header?: (newChat: ReactNode) => ReactNode;
};

/**
 * Moves focus to the composer, except on touch devices, where focusing a textarea opens the
 * on-screen keyboard.
 */
function focusUnlessTouch(element: HTMLTextAreaElement | null): void {
  if (element === null || window.matchMedia("(pointer: coarse)").matches) return;
  element.focus();
}

/**
 * False while the element is not rendered: it, or an ancestor, is display: none, so it has no
 * box. getClientRects rather than checkVisibility(), which Safari has only from 17.4, below the
 * 16.4 that Next.js supports.
 */
function isRendered(element: HTMLElement | null): boolean {
  return element !== null && element.getClientRects().length > 0;
}

/**
 * Chat's hasContent when the project passes none: what its renderer shows. The default renderer
 * shows the text and a chip for each tool call, so hasTextOrTools. A renderer of the project's
 * own counts as text only, hasVisibleText, the default before X-02, so a project that replaced
 * the renderer keeps the behaviour it had (template spec §5.8).
 */
export function defaultHasContent<M extends UIMessage>(
  renderAssistant: AssistantRenderer<M>,
): (message: M) => boolean {
  return renderAssistant === renderPlainText ? hasTextOrTools : hasVisibleText;
}

/**
 * The chat shell (X-01 design §1, §4.3): owns useChat and every piece of chat-level state, and
 * renders the site header with New chat (or the bar a project passes as header), the
 * conversation, the banners, the composer and the screen-reader status line. A project changes
 * it through the props above, from its own components/app-chat.tsx.
 */
export function Chat<M extends UIMessage = UIMessage>({
  modelLabel,
  isMock,
  commit,
  rateLimitPerHour,
  empty,
  transport,
  maxMessages = MAX_MESSAGES,
  renderAssistant = renderPlainText,
  hasContent = defaultHasContent(renderAssistant),
  header,
}: ChatProps<M>) {
  const { locale, t } = useLocale();
  const [annotations, setAnnotations] = useState<ReadonlyMap<string, MessageAnnotation>>(
    () => new Map(),
  );
  // No abort, no error and no finish reason: a server timeout.
  const [interrupted, setInterrupted] = useState(false);
  // The user pressed Stop or Esc during the last request.
  const [stoppedByUser, setStoppedByUser] = useState(false);
  // Counts New chat presses; the focus effect below runs on each.
  const [newChats, setNewChats] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // An IME composition is open somewhere on the page: its Enter must not send, its Esc not stop.
  const composing = useRef(false);

  const { messages, status, error, sendMessage, regenerate, stop, setMessages, clearError } =
    useChat<M>({
      transport,
      onFinish: (event) => {
        const result = annotateFinish(event);
        setInterrupted(result.interrupted);
        const id = result.id;
        if (id !== null && (result.stopped || result.cutOff)) {
          setAnnotations((previous) =>
            new Map(previous).set(id, { stopped: result.stopped, cutOff: result.cutOff }),
          );
        }
      },
    });
  const { scrollRef, contentRef, isFollowing, scrollToBottom } = useStickToBottom();
  // The hook takes the scroll container through a callback ref; Chat keeps its own handle
  // so that New chat can scroll back to the top.
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useCallback(
    (element: HTMLDivElement | null) => {
      scrollElementRef.current = element;
      scrollRef(element);
    },
    [scrollRef],
  );

  const busy = isBusy(status);
  // Send, Enter, Regenerate and Retry act only when the chat is idle.
  const canRequest = status === "ready" || status === "error";
  const atCap = maxMessages !== null && messages.length >= maxMessages;
  const slot = regenerateSlot(messages, status, stoppedByUser, hasContent);
  const errorKind: ChatErrorKind | null =
    status === "error" ? describeChatError(error) : interrupted ? "generic" : null;

  const send = (text: string): boolean => {
    if (!canRequest || atCap || text.trim() === "") return false;
    setStoppedByUser(false);
    setInterrupted(false);
    scrollToBottom();
    // The route adds the interface language to the instructions (X-01 design §4.2).
    void sendMessage({ text }, { body: { locale } });
    focusUnlessTouch(inputRef.current);
    return true;
  };

  // Regenerate and Retry: replaces a trailing assistant message, or re-sends a trailing user message.
  const regen = () => {
    if (!canRequest || messages.length === 0) return;
    setStoppedByUser(false);
    setInterrupted(false);
    scrollToBottom();
    void regenerate({ body: { locale } });
    focusUnlessTouch(inputRef.current);
  };

  const handleStop = useCallback(() => {
    setStoppedByUser(true);
    void stop();
    focusUnlessTouch(inputRef.current);
  }, [stop]);

  const newChat = async () => {
    if (busy) await stop();
    setMessages([]);
    // setMessages leaves status and error alone; without this an old error banner would stay.
    clearError();
    setAnnotations(new Map());
    setInterrupted(false);
    setStoppedByUser(false);
    // The empty state opens at its title, not at the old scroll position. The list unmounts in
    // the next commit, which disconnects the observers that pin to the bottom.
    scrollElementRef.current?.scrollTo({ top: 0, behavior: "instant" });
    setNewChats((count) => count + 1);
  };

  // Tracks IME compositions (Chinese, Japanese or Korean input) on the whole page, the composer
  // included (template spec §5.8).
  useEffect(() => {
    const start = () => {
      composing.current = true;
    };
    const end = () => {
      composing.current = false;
    };
    document.addEventListener("compositionstart", start);
    document.addEventListener("compositionend", end);
    return () => {
      document.removeEventListener("compositionstart", start);
      document.removeEventListener("compositionend", end);
    };
  }, []);

  // Esc stops from anywhere on the page, but only while busy and while the chat is rendered. An
  // Esc another component already handled (a popover that closed, which marks it
  // defaultPrevented) stops nothing, and neither does one that belongs to an IME composition. A
  // chat that is not rendered ignores Esc: a drawer may keep it mounted but display: none when
  // closed, and its answer streams on unseen. The listener sits on window, so it runs after every
  // keydown listener on the document, a dialog's or a popover's among them, whatever order they
  // were added in. On the document, a listener added before a drawer opened ran first, and its
  // stop re-rendered the conversation as idle before the drawer looked, so an Esc meant to stop
  // the answer also closed the drawer (template spec §5.8).
  useEffect(() => {
    if (!busy) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (isComposingKey(event, composing.current)) return;
      if (isRendered(scrollElementRef.current)) handleStop();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, handleStop]);

  // Focus the composer on load and after each New chat, except on touch devices. After New chat
  // the focus waits for the commit, so it lands on the composer the empty chat shows, the cap
  // lifted.
  useEffect(() => {
    focusUnlessTouch(inputRef.current);
  }, [newChats]);

  // Polite announcements for screen readers; tokens are never read aloud.
  const announced = announcement(
    { messages, status, failed: errorKind !== null, stoppedByUser },
    hasContent,
  );

  const newChatButton = (
    <Button
      variant="outline"
      className="pointer-coarse:h-11 max-sm:aspect-square max-sm:px-0"
      onClick={() => void newChat()}
    >
      <Plus />
      {/* Icon only below sm, so the header fits at 375 px; the accessible name stays. */}
      <span className="max-sm:sr-only">{t.header.newChat}</span>
    </Button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header === undefined ? (
        <SiteHeader
          modelLabel={modelLabel}
          isMock={isMock}
          commit={commit}
          actions={newChatButton}
        />
      ) : (
        header(newChatButton)
      )}

      <main className="relative min-h-0 flex-1">
        <div ref={scrollContainerRef} className="h-full overflow-y-auto overscroll-contain">
          {messages.length === 0 ? (
            <EmptyState {...empty} rateLimitPerHour={rateLimitPerHour} onPrompt={send} />
          ) : (
            <MessageList
              contentRef={contentRef}
              messages={messages}
              status={status}
              annotations={annotations}
              slot={slot}
              onRegenerate={regen}
              renderAssistant={renderAssistant}
              hasContent={hasContent}
            />
          )}
        </div>
        {messages.length > 0 && !isFollowing && (
          <Button
            variant="outline"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-sm pointer-coarse:h-11"
            onClick={() => scrollToBottom({ smooth: true })}
          >
            <ArrowDown />
            {t.chat.jump}
          </Button>
        )}
      </main>

      {errorKind !== null && (
        <div className="mx-auto w-full max-w-2xl shrink-0 px-4 pb-2">
          {errorKind === "limit" ? (
            // Demo limit: the client's text in the selected language, not the 429 body; no Retry.
            <Alert variant="destructive">
              <AlertDescription>{format(t.errors.limit, { n: rateLimitPerHour })}</AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertDescription>{t.errors.generic}</AlertDescription>
              <AlertAction>
                <Button variant="outline" size="sm" className="pointer-coarse:h-11" onClick={regen}>
                  {t.chat.retry}
                </Button>
              </AlertAction>
            </Alert>
          )}
        </div>
      )}

      <Composer
        inputRef={inputRef}
        busy={busy}
        atCap={atCap}
        composing={composing}
        onSend={send}
        onStop={handleStop}
      />

      {/* A language switch remounts the region instead of changing its text, which a screen
          reader would announce as a new status. */}
      <div key={locale} role="status" className="sr-only">
        {announced === null ? "" : t.status[announced]}
      </div>
    </div>
  );
}

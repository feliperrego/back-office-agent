"use client";

import { DefaultChatTransport, type UIMessage } from "ai";
import { Play } from "lucide-react";
import { useCallback, useId, useMemo, type ReactNode } from "react";
import { AgentMessage } from "@/components/agent/agent-message";
import { Chat, type ChatHeaderActions } from "@/components/chat/chat";
import type { AssistantRenderer } from "@/components/chat/message-list";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { hasTextOrTools } from "@/lib/chat/ui";
import type { Sandbox } from "@/lib/sandbox/sandbox";

type AppChatProps = {
  modelLabel: string;
  isMock: boolean;
  commit: string;
  rateLimitPerHour: number;
  /** The request the agent works on, one of REQUEST_IDS (lib/sandbox/requests.ts). */
  requestId: string;
  /** The request's sandbox as this conversation leaves it: what a card's write would change. */
  sandbox: Sandbox;
  /** The conversation, each time it changes: the page folds it for the request pane. */
  onMessagesChange: (messages: UIMessage[]) => void;
};

/**
 * The agent panel's bar (P2's spec §1 item 2, §4.5): its name, which names the panel's region,
 * "Handle this request", which sends the person's message as a prompt does and waits while a card
 * does, and New chat. Always shown, on a phone too, above the conversation.
 */
function AgentBar({
  headingId,
  newChat,
  chat,
}: {
  headingId: string;
  newChat: ReactNode;
  chat: ChatHeaderActions;
}) {
  const { t } = useLocale();
  return (
    <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
      <h2 id={headingId} className="font-medium max-sm:sr-only">
        {t.request.agent}
      </h2>
      <div className="flex flex-1 items-center justify-end gap-2">
        <Button
          className="pointer-coarse:h-11"
          disabled={!chat.canSend}
          onClick={() => chat.send(t.request.handleMessage)}
        >
          <Play />
          {t.request.handle}
        </Button>
        {newChat}
      </div>
    </div>
  );
}

/**
 * The project's chat (X-01 design §4.2, §4.3), project-owned: the agent panel of one request
 * (P2's spec §1, §4.3–§4.5). P2's transport adds the request and the interface language to every
 * request body, a continuation after an answer included, and the route validates the request. It
 * posts the whole history, so the message cap stays on. A request of its own remounts the chat,
 * so a conversation never mixes two requests; the sandbox lives in this conversation only, in
 * memory (spec §2). P2's renderer shows the text, then the chips and the approval card
 * (AgentMessage), and counts a call as content; while a card waits the composer says to answer
 * it. The panel is a region named by its bar's heading, so landmark navigation reaches the bar,
 * the conversation (Chat's <main>) and the composer, next to the request's <aside> (the review's
 * m09). A <div> with the role, not a <section>: a <main> must have only <div> ancestors (HTML,
 * "hierarchically correct main element").
 */
export function AppChat({
  modelLabel,
  isMock,
  commit,
  rateLimitPerHour,
  requestId,
  sandbox,
  onMessagesChange,
}: AppChatProps) {
  const { t, locale } = useLocale();
  const headingId = useId();
  // useChat sends with the latest transport it is given (@ai-sdk/react 4.0.117, useChat's
  // latestRef), so a language switch reaches the next request, a continuation included.
  const transport = useMemo(
    () => new DefaultChatTransport<UIMessage>({ body: { requestId, locale } }),
    [requestId, locale],
  );
  const renderAssistant = useCallback<AssistantRenderer<UIMessage>>(
    (message, options) => (
      <AgentMessage message={message} {...options} sandbox={sandbox} isMock={isMock} />
    ),
    [sandbox, isMock],
  );

  return (
    <div role="region" aria-labelledby={headingId} className="flex min-h-0 flex-1 flex-col">
      <Chat
        key={requestId}
        modelLabel={modelLabel}
        isMock={isMock}
        commit={commit}
        rateLimitPerHour={rateLimitPerHour}
        transport={transport}
        renderAssistant={renderAssistant}
        hasContent={hasTextOrTools}
        approvalNotice={t.approval.notice}
        onMessagesChange={onMessagesChange}
        header={(newChat, chat) => <AgentBar headingId={headingId} newChat={newChat} chat={chat} />}
        empty={{ title: t.empty.title, intro: t.empty.subtitle, groups: [{ prompts: t.prompts }] }}
      />
    </div>
  );
}

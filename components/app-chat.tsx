"use client";

import { DefaultChatTransport, type UIMessage } from "ai";
import { useMemo } from "react";
import { Chat } from "@/components/chat/chat";
import { useLocale } from "@/components/i18n/locale-provider";

type AppChatProps = {
  modelLabel: string;
  isMock: boolean;
  commit: string;
  rateLimitPerHour: number;
  /** The request the agent works on, one of REQUEST_IDS (lib/sandbox/requests.ts). */
  requestId: string;
};

/**
 * The project's chat (X-01 design §4.2, §4.3), project-owned: the agent panel of one request
 * (P2's spec §1, §4.3). P2's transport adds the request and the interface language to every
 * request body, a continuation after an approval included, and the route validates the request.
 * It posts the whole history, so the message cap stays on. A request of its own remounts the
 * chat, so a conversation never mixes two requests; the sandbox lives in this conversation only,
 * in memory (spec §2). The request pane, the approval card and the chat's approval seams come
 * in a later build step (spec §1, §4.4, §4.5).
 */
export function AppChat({ modelLabel, isMock, commit, rateLimitPerHour, requestId }: AppChatProps) {
  const { t, locale } = useLocale();
  // useChat sends with the latest transport it is given (@ai-sdk/react 4.0.117, useChat's
  // latestRef), so a language switch reaches the next request, a continuation included.
  const transport = useMemo(
    () => new DefaultChatTransport<UIMessage>({ body: { requestId, locale } }),
    [requestId, locale],
  );

  return (
    <Chat
      key={requestId}
      modelLabel={modelLabel}
      isMock={isMock}
      commit={commit}
      rateLimitPerHour={rateLimitPerHour}
      transport={transport}
      empty={{ title: t.empty.title, intro: t.empty.subtitle, groups: [{ prompts: t.prompts }] }}
    />
  );
}

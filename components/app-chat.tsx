"use client";

import { Chat } from "@/components/chat/chat";
import { useLocale } from "@/components/i18n/locale-provider";

type AppChatProps = {
  modelLabel: string;
  isMock: boolean;
  commit: string;
  rateLimitPerHour: number;
};

/**
 * The project's chat (X-01 design §4.2, §4.3). Project-owned. A server page cannot pass functions
 * to a client component, so this client wrapper is where a project passes Chat's other props: a
 * transport, maxMessages, renderAssistant or hasContent. The template passes only its own text
 * and keeps every default.
 */
export function AppChat({ modelLabel, isMock, commit, rateLimitPerHour }: AppChatProps) {
  const { t } = useLocale();

  return (
    <Chat
      modelLabel={modelLabel}
      isMock={isMock}
      commit={commit}
      rateLimitPerHour={rateLimitPerHour}
      empty={{ title: t.empty.title, intro: t.empty.subtitle, groups: [{ prompts: t.prompts }] }}
    />
  );
}

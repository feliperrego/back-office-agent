"use client";

import type { ReactNode } from "react";
import { LanguageSwitch } from "@/components/i18n/language-switch";
import { useLocale } from "@/components/i18n/locale-provider";
import { PRODUCT_NAME } from "@/lib/project";

type SiteHeaderProps = {
  modelLabel: string;
  isMock: boolean;
  commit: string;
  /** Page actions, such as the chat's New chat button, placed just before the language switch. */
  actions?: ReactNode;
};

/**
 * The header of every page (X-01 design §4.2). It carries the attribute contract that tests and
 * the measurement script read (template spec §5.6, §7.5): data-model, data-commit, and data-mock
 * only in mock mode.
 */
export function SiteHeader({ modelLabel, isMock, commit, actions }: SiteHeaderProps) {
  const { t } = useLocale();

  return (
    <header
      className="flex shrink-0 items-center gap-2 border-b px-4 py-2"
      data-model={modelLabel}
      data-commit={commit}
      // Present only in mock mode. Never pass a boolean: React renders false as "false".
      data-mock={isMock ? "" : undefined}
    >
      {/* The product name stays untranslated. */}
      <h1 className="sr-only">{PRODUCT_NAME}</h1>
      <span className="min-w-0 truncate font-medium">{modelLabel}</span>
      {isMock && (
        <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
          {t.header.mockBadge}
        </span>
      )}
      {/* ml-auto sits on this wrapper, so the switch stays at the right end with or without actions. */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {actions}
        <LanguageSwitch />
      </div>
    </header>
  );
}

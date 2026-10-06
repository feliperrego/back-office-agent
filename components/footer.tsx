"use client";

import { useLocale } from "@/components/i18n/locale-provider";
import { REPO_URL } from "@/lib/project";

/**
 * Links to feliperrego.com and to the project's repo (template spec §5.5); the repo URL comes
 * from lib/project.ts (X-01 design §4.2). Pages place it themselves, so a full-height layout
 * can put it inside its column.
 */
export function Footer() {
  const { t } = useLocale();

  return (
    <footer className="border-t px-4 py-3 text-center text-sm text-muted-foreground">
      {t.footer.builtBy}{" "}
      <a
        href="https://feliperrego.com"
        className="underline underline-offset-4 pointer-coarse:inline-block pointer-coarse:py-3"
      >
        Felipe Rêgo
      </a>
      {" · "}
      <a
        href={REPO_URL}
        className="underline underline-offset-4 pointer-coarse:inline-block pointer-coarse:py-3"
      >
        {t.footer.source}
      </a>
    </footer>
  );
}

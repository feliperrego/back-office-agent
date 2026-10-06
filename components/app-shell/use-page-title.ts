import { useEffect } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";
import { type Messages, messages } from "@/lib/i18n/messages";
import { pageTitle } from "./page-title";

/**
 * Names the page in the browser tab in the interface language (template spec §5.12). `name`
 * reads the page's name from a dictionary. The page's metadata gives the served HTML the
 * English title, as pages are served in English; this effect sets the current locale's, and
 * Next's route announcer reads it after a client-side navigation. React writes the served title
 * back when it hydrates the head after this effect, and a navigation's new head can land after
 * it too, so while the page is shown the served title is replaced again whenever it returns.
 * Another page's title is left alone.
 */
export function usePageTitle(name: (t: Messages) => string): void {
  const { t } = useLocale();
  const title = pageTitle(name(t));
  const served = pageTitle(name(messages[DEFAULT_LOCALE]));

  useEffect(() => {
    document.title = title;
    if (title === served) return;
    const observer = new MutationObserver(() => {
      if (document.title === served) document.title = title;
    });
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [title, served]);
}

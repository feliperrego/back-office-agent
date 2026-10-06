"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, resolveLocale, type Locale } from "@/lib/i18n/locale";
import { messages, type Messages } from "@/lib/i18n/messages";

export type UseLocale = {
  locale: Locale;
  /** A choice made with the language switch: stored, and it survives a reload. */
  setLocale: (locale: Locale) => void;
  /** The dictionary of the current locale. */
  t: Messages;
};

/**
 * The locale as a small module-level external store read through useSyncExternalStore. It is
 * null until the first client read resolves it, so a choice made before that read is never
 * overwritten.
 */
let current: Locale | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readStoredLocale(): string | null {
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): Locale {
  current ??= resolveLocale({ search: window.location.search, stored: readStoredLocale() });
  return current;
}

// Pages are prerendered in English; the locale is resolved on the client.
function getServerSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

function setLocale(locale: Locale): void {
  current = locale;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // No storage: the choice lasts until the page is reloaded.
  }
  // Left in the URL, `lang` would override the stored choice on reload.
  const url = new URL(window.location.href);
  if (url.searchParams.has("lang")) {
    url.searchParams.delete("lang");
    // The native History API call of the Next.js docs (node_modules/next/dist/docs/01-app/
    // 01-getting-started/04-linking-and-navigating.md, "Native History API"): with null,
    // Next.js keeps its own history state and moves its router to the new URL, with no
    // request and no reload. history.state would skip that sync, and the router's next
    // history write would bring `lang` back.
    window.history.replaceState(null, "", url);
  }
  for (const listener of listeners) listener();
}

const LocaleContext = createContext<UseLocale | null>(null);

/**
 * Provides the interface language to the client tree and mirrors it on <html lang>. It also sets
 * `data-hydrated` on <html> once the page shows the client's locale, a signal for tests that
 * does not depend on any one page (X-01 design §4.2, §6).
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // app/layout.tsx renders <html lang="en">. The effect only writes the DOM, never state.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    // The hydration render uses the server snapshot; when the client's locale differs, React
    // renders again right away, and this effect runs once more with it.
    if (locale === getSnapshot()) root.dataset.hydrated = "";
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t: messages[locale] }), [locale]);
  return <LocaleContext value={value}>{children}</LocaleContext>;
}

export function useLocale(): UseLocale {
  const value = useContext(LocaleContext);
  if (value === null) throw new Error("useLocale() must be called inside <LocaleProvider>.");
  return value;
}

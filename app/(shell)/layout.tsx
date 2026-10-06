import { Bot, ChartColumn, MessageSquare } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { localized } from "@/lib/i18n/localized";
import { siteHeaderProps } from "@/lib/site-header";

/**
 * The frame of the template's pages besides a full-page chat (template spec §5.12): /evals and
 * its case pages, and a non-chat project's home page (template spec §9 step 6b.4). Project-owned: a project names its own pages here, its brand mark and its banner, with
 * their words from its dictionary in every language. A server component: the header's values
 * are server-only, so they reach the client frame as props. In the template, the chat at "/" stays
 * outside it, as a full page.
 */
export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      {...siteHeaderProps()}
      brand={{ icon: <Bot />, tagline: localized((t) => t.site.tagline) }}
      nav={[
        { href: "/", label: localized((t) => t.site.home), icon: <MessageSquare /> },
        { href: "/evals", label: localized((t) => t.evals.title), icon: <ChartColumn /> },
      ]}
      banner={localized((t) => t.site.banner)}
    >
      {children}
    </AppShell>
  );
}

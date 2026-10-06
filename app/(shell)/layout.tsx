import { Bot, ChartColumn, SquareKanban } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { SUPPORT_ASSISTANT_URL } from "@/lib/board/board";
import { localized } from "@/lib/i18n/localized";
import { siteHeaderProps } from "@/lib/site-header";

/**
 * The frame of P2's pages besides a request's page (template spec §5.12; P2's spec §1): the Board
 * at "/" and the Evals pages, with the nav Board and Evals, and the banner on every page: the
 * store is fictional, some requests came from P1, linked, and the agent changes nothing until a
 * person approves. Project-owned. A server component: the header's values are server-only, so
 * they reach the client frame as props. A request's page stays outside it, as a full page, as
 * P1's /try does.
 */
export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      {...siteHeaderProps()}
      brand={{ icon: <Bot />, tagline: localized((t) => t.site.tagline) }}
      nav={[
        { href: "/", label: localized((t) => t.site.home), icon: <SquareKanban /> },
        { href: "/evals", label: localized((t) => t.evals.title), icon: <ChartColumn /> },
      ]}
      banner={localized((t) => t.site.banner)}
      bannerLink={{ href: SUPPORT_ASSISTANT_URL, label: localized((t) => t.site.bannerLink) }}
    >
      {children}
    </AppShell>
  );
}

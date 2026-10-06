"use client";

import { Info, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useId } from "react";
import { Footer } from "@/components/footer";
import { useLocale } from "@/components/i18n/locale-provider";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import type { Localized } from "@/lib/i18n/localized";
import { PRODUCT_NAME } from "@/lib/project";
import type { SiteHeaderValues } from "@/lib/site-header";
import { isCurrent, type NavItem } from "./nav";

export type { NavItem } from "./nav";

export type AppShellProps = SiteHeaderValues & {
  /** The mark beside the product name, such as a lucide icon, and a line under the name. */
  brand: { icon: ReactNode; tagline?: Localized };
  /** The project's pages, in order. */
  nav: readonly NavItem[];
  /** Page actions in the header, after the phone's nav button (P2's agent panel toggle, say). */
  actions?: ReactNode;
  /** A note on every page, such as "the data is fictional". */
  banner?: Localized;
  children: ReactNode;
};

function ShellSidebar({ brand, nav }: Pick<AppShellProps, "brand" | "nav">) {
  const { locale, t } = useLocale();
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const labelId = useId();

  return (
    <Sidebar mobileTitle={t.appShell.navTitle} mobileDescription={t.appShell.navDescription}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground [&_svg]:size-4">
            {brand.icon}
          </span>
          <span className="flex min-w-0 flex-col">
            {/* The product name stays untranslated, as in the header's h1. */}
            <span className="truncate text-sm font-semibold">{PRODUCT_NAME}</span>
            {brand.tagline !== undefined && (
              <span className="truncate text-xs text-muted-foreground">
                {brand.tagline[locale]}
              </span>
            )}
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel id={labelId}>{t.appShell.navLabel}</SidebarGroupLabel>
          <SidebarGroupContent>
            <nav aria-labelledby={labelId}>
              <SidebarMenu>
                {nav.map(({ href, label, icon }) => {
                  const current = isCurrent(pathname, href);
                  return (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton
                        isActive={current}
                        className="pointer-coarse:h-11"
                        render={
                          <Link
                            href={href}
                            aria-current={current ? "page" : undefined}
                            onClick={() => setOpenMobile(false)}
                          />
                        }
                      >
                        {icon}
                        <span>{label[locale]}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

/** Opens the nav on a phone, where the sidebar is a sheet; from md up the sidebar is always shown. */
function NavTrigger() {
  const { t } = useLocale();
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t.appShell.openNav}
      className="md:hidden pointer-coarse:size-11"
      onClick={toggleSidebar}
    >
      <Menu />
    </Button>
  );
}

// From md up the sidebar stays open: a controlled state that never changes, so the sidebar's
// keyboard shortcut cannot hide it with no button to bring it back.
const ALWAYS = () => {};

/**
 * The frame of a project's pages (template spec §5.12): the nav, held open from md up and a sheet
 * opened from the header on a phone; then the site header, the banner, the page and the footer.
 * From lg up it fills the window and the page scrolls inside it, so a page's columns can scroll
 * on their own; below lg everything stacks and the window scrolls. A server layout renders it
 * with siteHeaderProps() and the project's words in every language. It imports nothing of the
 * chat, so a project without a chat keeps it (template spec §9 step 6b).
 */
export function AppShell({ brand, nav, actions, banner, children, ...header }: AppShellProps) {
  const { locale } = useLocale();
  return (
    <SidebarProvider open onOpenChange={ALWAYS}>
      <ShellSidebar brand={brand} nav={nav} />
      <div className="flex min-h-svh min-w-0 flex-1 flex-col lg:h-svh lg:min-h-0">
        <SiteHeader
          {...header}
          actions={
            <>
              <NavTrigger />
              {actions}
            </>
          }
        />
        {banner !== undefined && (
          <p
            role="note"
            data-testid="banner"
            className="flex shrink-0 items-start gap-2 border-b bg-amber-50 px-4 py-1.5 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
          >
            <Info className="mt-px size-3.5 shrink-0" />
            <span>{banner[locale]}</span>
          </p>
        )}
        <main className="flex min-w-0 flex-1 flex-col lg:min-h-0 lg:overflow-y-auto">
          {children}
        </main>
        <Footer />
      </div>
    </SidebarProvider>
  );
}

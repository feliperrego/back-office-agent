import type { ReactNode } from "react";
import type { Localized } from "@/lib/i18n/localized";

/**
 * One item of the app shell's nav (template spec §5.12): a page of the project. A server layout
 * passes it, so its label comes in every language (lib/i18n/localized.ts) and its icon as an
 * element, such as a lucide icon.
 */
export type NavItem = {
  href: string;
  label: Localized;
  icon: ReactNode;
};

/**
 * Whether the item is the current page's: its own path and every path below it, so a case page
 * keeps Evals marked; "/" marks the home page only. Pure.
 */
export function isCurrent(pathname: string | null, href: string): boolean {
  if (pathname === null) return false;
  if (pathname === href) return true;
  return href !== "/" && pathname.startsWith(`${href}/`);
}

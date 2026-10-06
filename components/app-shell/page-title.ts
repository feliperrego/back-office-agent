import { PRODUCT_NAME } from "@/lib/project";

/**
 * A page's title in the browser tab (template spec §5.12): the page's own name, then the
 * product's. Next announces a client-side navigation to screen readers only when the title
 * changes, so every page of the shell has its own. Pure, for the server and the client.
 */
export function pageTitle(name: string): string {
  return `${name} · ${PRODUCT_NAME}`;
}

/** The root layout's `title.template`: pageTitle with Next's `%s` for the page's name. */
export const PAGE_TITLE_TEMPLATE = pageTitle("%s");

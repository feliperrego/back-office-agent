/**
 * The project's identity (template spec §9 step 6), in one file: these four values and the
 * package.json `name` (which must equal PROJECT_SLUG; see project.test.ts). The layout metadata,
 * the footer's repo link, the page's h1, the rate-limit key prefix and the locale storage key all
 * read from here. Pure and client-safe.
 */

/**
 * Shown as the page title and the header's h1 (spec §10, P2-01). It stays untranslated. The store
 * is P1's fictional Acme Outfitters.
 */
export const PRODUCT_NAME = "Acme Outfitters Back Office";

/** The layout's meta description, for browser tabs and link previews (spec §1). */
export const PRODUCT_DESCRIPTION =
  "Back-office demo for a fictional outdoor-gear store: an agent proposes each order change and a person approves or rejects it before it runs. By Felipe Rêgo.";

/** The repo name (spec §10, P2-01). Also namespaces the rate-limit counters and the stored locale. */
export const PROJECT_SLUG = "back-office-agent";

export const REPO_URL = "https://github.com/feliperrego/back-office-agent";

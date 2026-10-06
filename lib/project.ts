/**
 * The project's identity (X-01 design §4.2), in one file a project edits when it is created:
 * set these four values and the package.json `name` (which must equal PROJECT_SLUG; see
 * project.test.ts). The layout metadata, the footer's repo link, the page's h1, the rate-limit
 * key prefix and the locale storage key all read from here. Pure and client-safe.
 */

/** Shown as the page title and the header's h1. It stays untranslated. */
export const PRODUCT_NAME = "AI Portfolio Template";

/** The layout's meta description, for browser tabs and link previews. */
export const PRODUCT_DESCRIPTION = "Starter for small AI portfolio projects by Felipe Rêgo.";

/** The repo name. Also namespaces the rate-limit counters and the stored locale. */
export const PROJECT_SLUG = "ai-portfolio-template";

export const REPO_URL = "https://github.com/feliperrego/ai-portfolio-template";

import { expect, type Page } from "@playwright/test";
import { messages } from "@/lib/i18n/messages";

// Site-level helpers for the interface language (X-01 design §6). They read only what every page
// has, the header, the switch and the footer, so they survive the removal recipe of a non-chat
// project (X-01 design §5). The page is prerendered in English and switches after hydration, so
// a spec asserts Portuguese web-first only, and English only once the page has hydrated.

/** The header of every page, with the attribute contract of template spec §5.6. */
export const header = (page: Page) => page.locator("header[data-model]");
export const footer = (page: Page) => page.locator("footer");

/**
 * The smallest touch target, 44 px, less the float error of `boundingBox()`: at the phone
 * emulation's device scale factor a 44 px button can measure 43.999998 px.
 */
export const MIN_TARGET_PX = 44 - 0.01;
// exact: a non-exact "EN" also matches "Send message".
export const switchButton = (page: Page, name: "EN" | "PT") =>
  page.getByRole("button", { name, exact: true });

/**
 * Waits until the page shows the client's locale: LocaleProvider sets data-hydrated on <html>
 * from its effect once the rendered locale is the one the client resolved (X-01 design §4.2).
 * After this, an English assertion can no longer pass on the prerendered HTML alone.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "");
}

/** Portuguese: <html lang>, the pressed PT button, the mock badge and the footer. */
export async function expectPortuguese(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(switchButton(page, "PT")).toHaveAttribute("aria-pressed", "true");
  await expect(switchButton(page, "EN")).toHaveAttribute("aria-pressed", "false");
  // e2e runs in mock mode, so the badge is on screen.
  await expect(header(page).getByText("Modelo simulado", { exact: true })).toBeVisible();
  await expect(footer(page)).toHaveText("Feito por Felipe Rêgo · Código no GitHub");
}

/** English: <html lang>, the pressed EN button, the mock badge and the footer. */
export async function expectEnglish(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(switchButton(page, "EN")).toHaveAttribute("aria-pressed", "true");
  await expect(switchButton(page, "PT")).toHaveAttribute("aria-pressed", "false");
  await expect(header(page).getByText("Mock model", { exact: true })).toBeVisible();
  await expect(footer(page)).toHaveText("Built by Felipe Rêgo · Source on GitHub");
}

/**
 * The fixed text of every English value that differs from its pt-BR value: the parts between
 * {placeholders} that the pt-BR value does not also contain. So chat.rateNote gives
 * " messages/hour per visitor; regenerations count", and a value equal in both gives nothing.
 */
export function englishOnly(en: unknown, pt: unknown): string[] {
  if (typeof en === "string" && typeof pt === "string") {
    return en.split(/\{\w+\}/).filter((fragment) => !pt.includes(fragment));
  }
  const ptValues = pt as Record<string, unknown>;
  return Object.entries(en as Record<string, unknown>).flatMap(([key, value]) =>
    englishOnly(value, ptValues[key]),
  );
}

const ENGLISH_ONLY = englishOnly(messages.en, messages["pt-BR"]);

/**
 * The English-only strings found in the page's interface text or in any aria-label or
 * placeholder. The messages are left out: they are the visitor's and the model's words, and the
 * mock answers in English. So is any text a page marks lang="en" inside <body>.
 */
export async function englishLeftovers(page: Page): Promise<string[]> {
  const texts = await page.evaluate(() => {
    const skipped = [
      "script",
      "style",
      '[data-message-role="user"]',
      '[data-message-role="assistant"] > :first-child',
      // Inside <body>: in English, <html lang="en"> would skip the whole page.
      'body [lang="en"]',
    ].join(", ");
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes: string[] = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (node.parentElement?.closest(skipped)) continue;
      nodes.push(node.textContent ?? "");
    }
    const attributes = (name: string) =>
      Array.from(document.querySelectorAll(`[${name}]`), (element) => element.getAttribute(name));
    return [nodes.join("\n"), ...attributes("aria-label"), ...attributes("placeholder")];
  });
  return ENGLISH_ONLY.filter((fragment) => texts.some((text) => text?.includes(fragment)));
}

export async function expectNoEnglish(page: Page): Promise<void> {
  await expect.poll(() => englishLeftovers(page)).toEqual([]);
}

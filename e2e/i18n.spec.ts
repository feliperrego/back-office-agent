import { expect, test, type Page } from "@playwright/test";
import { LOCALE_STORAGE_KEY } from "@/lib/i18n/locale";
import { shellMessages } from "@/lib/i18n/shell-messages";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME, REPO_URL } from "@/lib/project";
import {
  englishLeftovers,
  expectEnglish,
  expectNoEnglish,
  expectPortuguese,
  footer,
  header,
  switchButton,
  waitForHydration,
  MIN_TARGET_PX,
} from "./helpers/i18n";

// E2E for the interface language at site level (X-01 design §6): the production build in mock
// mode. It reads only what every page has, the header with its switch and the footer, and never
// the chat, so it holds on the non-chat page the removal recipe leaves (X-01 design §5). The page
// is prerendered in English and switches after hydration, so Portuguese is asserted web-first
// only, and English only once the page has hydrated (waitForHydration). The language shows in
// <html lang>, the switch's aria-pressed, the mock badge and the footer (expectEnglish,
// expectPortuguese).

const FOOTER_LINKS_EN = ["Felipe Rêgo", "Source on GitHub"];
const FOOTER_LINKS_PT = ["Felipe Rêgo", "Código no GitHub"];

/** Collects uncaught page errors and console errors. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function storedLocale(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), LOCALE_STORAGE_KEY);
}

/**
 * The switch is the header's last item: its right edge is the header's right padding edge, with
 * or without page actions before it (X-01 design §4.2).
 */
async function expectSwitchAtRightEnd(page: Page): Promise<void> {
  const contentRight = await header(page).evaluate(
    (element) =>
      element.getBoundingClientRect().right - parseFloat(getComputedStyle(element).paddingRight),
  );
  // The language group is the header's only group.
  const group = await header(page).getByRole("group").boundingBox();
  if (group === null) throw new Error("The language switch is not visible.");
  expect(Math.abs(group.x + group.width - contentRight)).toBeLessThanOrEqual(1);
}

/**
 * A phone: EN and PT are 44 × 44 px, the footer links 44 px tall, the switch still at the right
 * end, and the page does not scroll sideways. The sizes come from CSS, so they are the same before
 * and after hydration.
 */
async function expectPhoneLayout(page: Page, footerLinks: string[]): Promise<void> {
  for (const name of ["EN", "PT"] as const) {
    const box = await switchButton(page, name).boundingBox();
    expect(box?.height, `height of ${name}`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    expect(box?.width, `width of ${name}`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  }
  for (const name of footerLinks) {
    const box = await footer(page).getByRole("link", { name, exact: true }).boundingBox();
    expect(box?.height, `height of "${name}"`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  }
  await expectSwitchAtRightEnd(page);
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
}

test.describe("the served HTML", () => {
  // With no JavaScript the page stays exactly as served: nothing hydrates.
  test.use({ javaScriptEnabled: false });

  test("is static English whatever ?lang= says, with the project's metadata and no data-hydrated", async ({
    page,
  }) => {
    await page.goto("/?lang=pt-BR");
    const root = page.locator("html");
    await expect(root).toHaveAttribute("lang", "en");
    // Set only on the client, so waitForHydration cannot pass on the served HTML.
    await expect(root).not.toHaveAttribute("data-hydrated");
    await expect(page).toHaveTitle(PRODUCT_NAME);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      PRODUCT_DESCRIPTION,
    );
    await expect(header(page).getByRole("heading", { level: 1 })).toHaveText(PRODUCT_NAME);
    await expect(switchButton(page, "EN")).toHaveAttribute("aria-pressed", "true");
    await expect(switchButton(page, "PT")).toHaveAttribute("aria-pressed", "false");
    await expect(header(page).getByText("Mock model", { exact: true })).toBeVisible();
    await expect(footer(page)).toHaveText("Built by Felipe Rêgo · Source on GitHub");
    await expect(
      footer(page).getByRole("link", { name: "Source on GitHub", exact: true }),
    ).toHaveAttribute("href", REPO_URL);
  });
});

test("?lang=pt-BR opens the page in Portuguese; data-hydrated arrives with it, and nothing errs", async ({
  page,
}) => {
  // <html lang> as it is when data-hydrated first appears.
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { e2eLangAtHydration: seen });
    new MutationObserver(() => {
      const root = document.documentElement;
      if (seen.length === 0 && root.hasAttribute("data-hydrated")) seen.push(root.lang);
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-hydrated"] });
  });
  const errors = collectErrors(page);

  await page.goto("/?lang=pt-BR");
  await waitForHydration(page);
  expect(
    await page.evaluate(
      () => (window as unknown as { e2eLangAtHydration: string[] }).e2eLangAtHydration,
    ),
  ).toEqual(["pt-BR"]);
  await expectPortuguese(page);
  // The product name stays untranslated.
  await expect(header(page).getByRole("heading", { level: 1 })).toHaveText(PRODUCT_NAME);
  expect(errors).toEqual([]);
});

test("PT translates the header and the footer; EN switches back; the switch stays at the right end", async ({
  page,
}) => {
  await page.goto("/");
  await waitForHydration(page);
  await expectEnglish(page);
  await expect(page.getByRole("group", { name: "Language", exact: true })).toBeVisible();
  await expectSwitchAtRightEnd(page);

  await switchButton(page, "PT").click();
  await expectPortuguese(page);
  await expect(page.getByRole("group", { name: "Idioma", exact: true })).toBeVisible();
  await expect(header(page).getByRole("heading", { level: 1 })).toHaveText(PRODUCT_NAME);
  await expectSwitchAtRightEnd(page);

  await switchButton(page, "EN").click();
  await expectEnglish(page);
  await expect(page.getByRole("group", { name: "Language", exact: true })).toBeVisible();
});

test("a choice made with the switch is stored under the project's key and survives a reload, in both directions", async ({
  page,
}) => {
  await page.goto("/");
  await waitForHydration(page);
  await switchButton(page, "PT").click();
  await expectPortuguese(page);
  expect(await storedLocale(page)).toBe("pt-BR");

  await page.reload();
  await expectPortuguese(page);

  // EN replaces the stored pt-BR.
  await waitForHydration(page);
  await switchButton(page, "EN").click();
  await expectEnglish(page);
  expect(await storedLocale(page)).toBe("en");

  await page.reload();
  await waitForHydration(page);
  await expectEnglish(page);
});

test("with localStorage blocked the switch still works until a reload, and ?lang=pt-BR still applies", async ({
  page,
}) => {
  // Safari's private mode, or site data disabled: every access to localStorage throws.
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
  });
  const errors = collectErrors(page);

  await page.goto("/");
  await waitForHydration(page);
  await expectEnglish(page);
  await switchButton(page, "PT").click();
  await expectPortuguese(page);

  // Nothing was stored: the choice lasts until the page is reloaded.
  await page.reload();
  await waitForHydration(page);
  await expectEnglish(page);

  await page.goto("/?lang=pt-BR");
  await expectPortuguese(page);
  expect(errors).toEqual([]);
});

test("EN after ?lang=pt-BR removes lang with no reload and no router request, and stays English", async ({
  page,
}) => {
  await page.goto("/?lang=pt-BR");
  await expectPortuguese(page);
  // A reload, or any other document load, would drop this marker.
  await page.evaluate(() => Object.assign(window, { e2eSameDocument: true }));
  const requests: URL[] = [];
  page.on("request", (request) => requests.push(new URL(request.url())));

  await switchButton(page, "EN").click();
  await expectEnglish(page);
  await expect(page).toHaveURL("/");
  // Room for a request the switch started to show up; the page makes none of its own.
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => "e2eSameDocument" in window)).toBe(true);
  // Neither a document request for / nor a Next.js router (RSC) request.
  const pageRequests = requests.filter(
    (url) => url.pathname === "/" || url.searchParams.has("_rsc"),
  );
  expect(pageRequests.map(String)).toEqual([]);

  await page.reload();
  await waitForHydration(page);
  await expectEnglish(page);
  await expect(page).toHaveURL("/");

  // Back leaves the page (a new context starts on about:blank). Forward loads / as a new
  // document: English, since the history entry no longer holds lang.
  await page.goBack();
  await page.goForward();
  await expect(page).toHaveURL("/");
  await waitForHydration(page);
  await expectEnglish(page);
});

test("the switch removes only lang: other parameters and the hash stay", async ({ page }) => {
  await page.goto("/?utm_source=e2e&lang=pt-BR#top");
  await expectPortuguese(page);
  await switchButton(page, "EN").click();
  await expectEnglish(page);
  await expect(page).toHaveURL("/?utm_source=e2e#top");
});

test("?lang=pt-BR alone is not stored: / in the same context opens in English", async ({
  page,
}) => {
  await page.goto("/?lang=pt-BR");
  await expectPortuguese(page);
  expect(await storedLocale(page)).toBeNull();

  await page.goto("/");
  await waitForHydration(page);
  await expectEnglish(page);
});

// Recorded English content, such as a tool's data or a recorded answer, is marked lang="en", and
// the pt-BR scan skips it (template spec §5.9): only what is marked, so an untranslated interface
// string still fails. The text is the dictionary's English footer link, which pt-BR words
// differently.
test('the pt-BR scan skips English marked lang="en" inside the page, and only that', async ({
  page,
}) => {
  const english = shellMessages.en.footer.source;
  await page.goto("/?lang=pt-BR");
  await expectPortuguese(page);
  await page.evaluate((text) => {
    const recorded = document.createElement("p");
    recorded.id = "recorded";
    recorded.lang = "en";
    recorded.textContent = text;
    document.body.append(recorded);
  }, english);
  await expect(page.locator("#recorded")).toHaveText(english);
  await expectNoEnglish(page);

  await page.locator("#recorded").evaluate((element) => element.removeAttribute("lang"));
  expect(await englishLeftovers(page)).toContain(english);
});

test.describe("a phone at 375×812 with touch", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test("the switch ends the header; EN, PT and the footer links are 44 px; no sideways scroll; in English and after tapping PT", async ({
    page,
  }) => {
    await page.goto("/");
    const isCoarsePointer = await page.evaluate(
      () => window.matchMedia("(pointer: coarse)").matches,
    );
    expect(isCoarsePointer).toBe(true);
    await waitForHydration(page);
    await expectEnglish(page);
    await expectPhoneLayout(page, FOOTER_LINKS_EN);

    await switchButton(page, "PT").tap();
    await expectPortuguese(page);
    await expectPhoneLayout(page, FOOTER_LINKS_PT);
  });
});

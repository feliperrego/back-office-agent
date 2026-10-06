import { expect, test, type Locator, type Page } from "@playwright/test";
import { isCurrent } from "@/components/app-shell/nav";
import { EVALS_PAGE } from "@/lib/eval/project";
import { readShownRun } from "@/lib/eval/runs";
import { caseView, evalsView } from "@/lib/eval/view";
import { format } from "@/lib/i18n/format";
import { messages } from "@/lib/i18n/messages";
import { PRODUCT_NAME } from "@/lib/project";
import {
  expectNoEnglish,
  expectPortuguese,
  header,
  MIN_TARGET_PX,
  waitForHydration,
} from "./helpers/i18n";

// The Evals page and a case's page (template spec §5.12): the production build in mock mode
// shows the committed mock run, which CI's `pnpm eval --check` has just checked. What each page
// should show comes from the shown run, through the view model the pages read (lib/eval/view.ts)
// with the project's words and links (EVALS_PAGE); cases are picked by property, never by id, so
// the spec holds when a real run replaces the mock one (template spec §5.11), and every path is
// the project's evalsHref or caseHref, so it holds wherever the project puts its pages. It reads
// nothing of the chat, so a project without a chat keeps it (template spec §9 step 6b).

// Shell text (lib/i18n/shell-messages.ts), re-declared as literals so that a rewording fails
// here instead of moving with the dictionary.
const MOCK_HEADLINE_EN = (passed: number, cases: number) =>
  `Mock run: ${passed} of ${cases} mock answers passed the grader. No measurement yet.`;
const MOCK_HEADLINE_PT = (passed: number, cases: number) =>
  `Rodada simulada: ${passed} de ${cases} respostas simuladas passaram no avaliador. Ainda sem medição.`;
const MOCK_USAGE_EN = "A mock run measures no tokens and no latency.";
/** The interval's line: the bootstrap's unlabelled, a Wilson interval named (lib/eval/stats.ts). */
const INTERVAL_EN = (level: number, low: number, high: number, method: "bootstrap" | "wilson") =>
  `${level}% CI ${low}–${high}%${method === "wilson" ? " (Wilson score)" : ""}`;
const OPEN_CASE_EN = (id: string) => `Open case ${id}`;
const OPEN_CASE_PT = (id: string) => `Abrir o caso ${id}`;

/** A page's title in the browser tab: its own name, then the product's. */
const TITLE = (name: string) => `${name} · ${PRODUCT_NAME}`;
/** Next's route announcer, a live region inside a shadow root, which Playwright's CSS pierces. */
const ANNOUNCER = "#__next-route-announcer__";

const shown = readShownRun();
const { run } = shown;
const view = evalsView(shown, EVALS_PAGE);
const withTool = run.results.find(({ result }) => result.toolCalls.length > 0);
const withoutTool = run.results.find(({ result }) => result.toolCalls.length === 0);

/**
 * The page the trace tests open: the shown run's first case with a tool call, so its chips show,
 * else its first case. A project whose eval calls no tool keeps these tests: they check the chips
 * a case has, none included (template spec §7.2).
 */
function traceCase() {
  return caseView(shown, (withTool ?? run.results[0]).id, EVALS_PAGE)!;
}

const hrefOf = (id: string) => view.rows.find((row) => row.id === id)!.href;
const shellNav = (page: Page) => page.getByRole("navigation", { name: "Pages" });

/** The Evals page, where the project puts it; the shell's nav links to it. */
const EVALS = EVALS_PAGE.evalsHref;
/** A URL that ends with the path. */
const endsWith = (path: string) => new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

/**
 * On a case's page the nav marks the Evals item current only when the case's path is below the
 * Evals page's (components/app-shell/nav.ts): a project may put its case pages elsewhere.
 */
async function expectEvalsCurrentOnCase(nav: Locator, id: string): Promise<void> {
  const evals = nav.locator(`a[href="${EVALS}"]`);
  if (isCurrent(hrefOf(id), EVALS)) await expect(evals).toHaveAttribute("aria-current", "page");
  else await expect(evals).not.toHaveAttribute("aria-current", "page");
}

async function expectNoSidewaysScroll(page: Page, path: string): Promise<void> {
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll, `sideways scroll on ${path}`).toBeLessThanOrEqual(widths.client);
}

async function expectTarget(locator: Locator, name: string): Promise<void> {
  const box = await locator.boundingBox();
  expect(box?.height, `height of ${name}`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
}

test("the Evals page shows the run, the headline, the groups, a row per case and the run's details", async ({
  page,
}) => {
  await page.goto(EVALS);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { level: 2, name: "Evals" })).toBeVisible();
  // The frame: the header's contract, the nav with Evals current, the banner.
  await expect(header(page)).toHaveAttribute("data-mock", "");
  await expect(header(page)).toHaveAttribute("data-commit", /^(?:local|[0-9a-f]{40})$/);
  await expect(shellNav(page).locator('[aria-current="page"]')).toHaveAttribute("href", EVALS);
  await expect(page.getByTestId("banner")).toBeVisible();

  const label = page.getByTestId("run-label");
  await expect(label).toContainText("Last eval run");
  await expect(label).toContainText(`model ${run.model}`);
  const headline = page.getByTestId("headline");
  if (run.mock) {
    // A mock run measures nothing: its pass counts, and no rate, interval, method, latency or
    // token count anywhere on the page (template spec §5.12).
    await expect(label).toContainText("Mock run");
    await expect(label).not.toContainText("commit");
    await expect(headline).toHaveText(MOCK_HEADLINE_EN(view.passed, view.cases));
    await expect(headline).not.toContainText("%");
    await expect(page.getByTestId("interval")).toHaveCount(0);
    await expect(page.getByTestId("supporting")).toHaveCount(0);
    await expect(page.getByText("Percentile bootstrap", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Wilson", { exact: false })).toHaveCount(0);
    await expect(page.getByTestId("cases").locator("thead th")).toHaveText([
      "Case",
      "Group",
      "Result",
    ]);
    await expect(page.locator("main")).not.toContainText("Latency");
    await expect(page.locator("main")).not.toContainText("Tokens");
  } else {
    const numbers = view.measured!.headline;
    await expect(label).toContainText(`commit ${view.run.commit}`);
    await expect(headline).toHaveText(
      format(EVALS_PAGE.headline.en, { ...numbers, cases: view.cases }),
    );
    await expect(page.getByTestId("interval")).toHaveText(
      INTERVAL_EN(numbers.level, numbers.low, numbers.high, view.measured!.interval.method),
    );
    await expect(page.getByTestId("supporting")).toContainText("Median latency");
  }

  const groups = page.getByTestId("groups").locator('[data-slot="card"]');
  await expect(groups).toHaveCount(view.groups.length);
  for (const [i, group] of view.groups.entries()) {
    await expect(groups.nth(i)).toContainText(group.label.en);
    await expect(groups.nth(i)).toContainText(`${group.passed} of ${group.cases}`);
  }

  const rows = page.getByTestId("cases").locator("tbody tr");
  await expect(rows).toHaveCount(view.rows.length);
  for (const [i, row] of view.rows.entries()) {
    await expect(rows.nth(i)).toHaveAttribute("data-case", row.id);
    await expect(rows.nth(i).getByRole("link", { name: OPEN_CASE_EN(row.id) })).toHaveAttribute(
      "href",
      row.href,
    );
    await expect(rows.nth(i)).toContainText(row.group.en);
    await expect(rows.nth(i).locator("[data-verdict]")).toHaveAttribute(
      "data-verdict",
      row.pass ? "pass" : "fail",
    );
  }

  const details = page.getByTestId("details");
  await expect(details).toContainText(`${run.caseSet.n} cases, frozen on`);
  await expect(details).toContainText(`SHA-256 ${run.caseSet.sha256.slice(0, 12)}`);
  await expect(details.getByRole("link", { name: shown.file })).toHaveAttribute(
    "href",
    view.details.rawDataHref,
  );
});

test("a case's page shows its question, its answer and its trace: the checks, the tool chips and the usage", async ({
  page,
}) => {
  const data = traceCase();
  await page.goto(EVALS);
  await waitForHydration(page);
  await page.getByRole("link", { name: OPEN_CASE_EN(data.id) }).click();
  await expect(page).toHaveURL(endsWith(hrefOf(data.id)));
  await expect(page.getByRole("heading", { level: 2, name: `Case ${data.id}` })).toBeVisible();
  await expectEvalsCurrentOnCase(shellNav(page), data.id);

  if (data.exchange !== null) {
    const recorded = page.getByTestId("exchange").locator('p[lang="en"]');
    await expect(recorded).toHaveText([data.exchange.question, data.exchange.answer]);
  }

  const trace = page.getByTestId("trace");
  await expect(trace.locator("[data-verdict]")).toHaveAttribute(
    "data-verdict",
    data.pass ? "pass" : "fail",
  );
  const checks = trace.getByTestId("checks").locator("li");
  await expect(checks).toHaveCount(data.checks.length);
  for (const [i, check] of data.checks.entries()) {
    await expect(checks.nth(i)).toHaveAttribute("data-check", check.id);
    await expect(checks.nth(i)).toHaveAttribute("data-ok", String(check.ok));
    await expect(checks.nth(i)).toContainText(data.checkLabels[check.id].en);
  }

  await expect(trace.locator("[data-tool]")).toHaveCount(data.toolCalls.length);
  for (const call of data.toolCalls) {
    const chip = trace.locator(`[data-tool="${call.name}"]`).first();
    await expect(chip).toHaveAttribute("data-tool-state", call.state);
    await chip.getByRole("button").click();
    await expect(chip.getByText("Input", { exact: true })).toBeVisible();
    await expect(chip.locator('pre[lang="en"]').first()).toBeVisible();
  }

  const usage = trace.getByTestId("usage");
  if (data.measured === null) {
    await expect(usage).toHaveText(MOCK_USAGE_EN);
    await expect(usage).not.toContainText(/\d/);
  } else {
    await expect(usage).toContainText("Latency");
  }

  await page.getByRole("link", { name: "All cases" }).click();
  await expect(page).toHaveURL(endsWith(EVALS));
});

test("a case with no tool call says so, and an id the run does not hold is a 404", async ({
  page,
}) => {
  if (withoutTool !== undefined) {
    await page.goto(hrefOf(withoutTool.id));
    await expect(page.getByTestId("trace")).toContainText("No tool was called.");
    await expect(page.getByTestId("trace").locator("[data-tool]")).toHaveCount(0);
  }
  // dynamicParams = false: only the shown run's cases have a page (template spec §5.12).
  const response = await page.goto(EVALS_PAGE.caseHref("not-a-case"));
  expect(response?.status()).toBe(404);
});

// The app shell leaves Ctrl+B and Cmd+B to the browser and to the page, such as bold in a text
// field: the generated sidebar's shortcut, which toggled a sidebar the shell holds open, is not
// in the template (template spec §5.12).
test("the app shell takes neither Ctrl+B nor Cmd+B", async ({ page }) => {
  await page.goto(EVALS);
  await waitForHydration(page);
  // Added after every listener the page's own code added on window, so it runs last.
  await page.evaluate(() => {
    const prevented: boolean[] = [];
    Object.assign(window, { boldKeysPrevented: prevented });
    window.addEventListener("keydown", (event) => {
      if (event.key === "b") prevented.push(event.defaultPrevented);
    });
  });
  await page.keyboard.press("Control+b");
  await page.keyboard.press("Meta+b");
  const prevented = await page.evaluate(
    () => (window as unknown as { boldKeysPrevented: boolean[] }).boldKeysPrevented,
  );
  expect(prevented).toEqual([false, false]);
});

test("in Portuguese the Evals pages show no English interface text", async ({ page }) => {
  await page.goto(`${EVALS}?lang=pt-BR`);
  await expectPortuguese(page);
  await expect(page.getByRole("heading", { level: 2, name: "Avaliações" })).toBeVisible();
  if (run.mock) {
    await expect(page.getByTestId("headline")).toHaveText(
      MOCK_HEADLINE_PT(view.passed, view.cases),
    );
  }
  await expectNoEnglish(page);

  const data = traceCase();
  await page.goto(`${hrefOf(data.id)}?lang=pt-BR`);
  await expectPortuguese(page);
  await expect(page.getByRole("heading", { level: 2, name: `Caso ${data.id}` })).toBeVisible();
  await expectNoEnglish(page);
});

// Next announces a client-side navigation only when the title changes, so each page has its own
// title, in the interface language (template spec §5.12).
test.describe("page titles", () => {
  test("each Evals page has its own title, and following a link announces the new one", async ({
    page,
  }) => {
    const { id } = run.results[0];
    await page.goto(EVALS);
    await waitForHydration(page);
    await expect(page).toHaveTitle(TITLE("Evals"));

    await page.getByRole("link", { name: OPEN_CASE_EN(id) }).click();
    await expect(page).toHaveTitle(TITLE(`Case ${id}`));
    await expect(page.locator(ANNOUNCER)).toHaveText(TITLE(`Case ${id}`));

    await page.getByRole("link", { name: "All cases" }).click();
    await expect(page).toHaveTitle(TITLE("Evals"));
    await expect(page.locator(ANNOUNCER)).toHaveText(TITLE("Evals"));
  });

  test("in Portuguese the titles are Portuguese, and following a link announces the new one", async ({
    page,
  }) => {
    const { id } = run.results[0];
    await page.goto(`${EVALS}?lang=pt-BR`);
    await expectPortuguese(page);
    await expect(page).toHaveTitle(TITLE("Avaliações"));

    await page.getByRole("link", { name: OPEN_CASE_PT(id) }).click();
    await expect(page).toHaveTitle(TITLE(`Caso ${id}`));
    await expect(page.locator(ANNOUNCER)).toHaveText(TITLE(`Caso ${id}`));

    await page.getByRole("link", { name: "Todos os casos" }).click();
    await expect(page).toHaveTitle(TITLE("Avaliações"));
    await expect(page.locator(ANNOUNCER)).toHaveText(TITLE("Avaliações"));

    // A page that names itself in no title, the chat, keeps the product's name.
    await page
      .getByRole("navigation", { name: messages["pt-BR"].appShell.navLabel })
      .getByRole("link", { name: messages["pt-BR"].site.home })
      .click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page).toHaveTitle(PRODUCT_NAME);
    await expect(page.locator(ANNOUNCER)).toHaveText(PRODUCT_NAME);
  });

  test.describe("the served HTML", () => {
    test.use({ javaScriptEnabled: false });

    test("names each page in its title, in English", async ({ page }) => {
      await page.goto(EVALS);
      await expect(page).toHaveTitle(TITLE("Evals"));
      for (const { id } of run.results) {
        await page.goto(hrefOf(id));
        await expect(page).toHaveTitle(TITLE(`Case ${id}`));
      }
    });
  });
});

test.describe("a phone at 375×812 with touch", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test("the Evals pages never scroll sideways, and the nav opens from the header", async ({
    page,
  }) => {
    const data = traceCase();
    for (const path of [EVALS, hrefOf(data.id)]) {
      await page.goto(path);
      await waitForHydration(page);
      await expectNoSidewaysScroll(page, path);
    }
    // On the case page: the way back and the nav button are 44 px targets.
    await expectTarget(page.getByRole("link", { name: "All cases" }), "All cases");
    const trigger = page.getByRole("button", { name: "Open the navigation" });
    await expectTarget(trigger, "the nav button");

    await trigger.tap();
    const sheet = page.getByRole("dialog", { name: "Navigation" });
    await expect(sheet).toBeVisible();
    await expectEvalsCurrentOnCase(sheet, data.id);
    const evals = sheet.getByRole("link", { name: "Evals" });
    await expectTarget(evals, "the nav's Evals link");
    await evals.tap();
    await expect(page).toHaveURL(endsWith(EVALS));
    await expect(sheet).toBeHidden();
    await expectNoSidewaysScroll(page, EVALS);
  });

  test("in Portuguese the phone's nav and pages are Portuguese", async ({ page }) => {
    await page.goto(`${EVALS}?lang=pt-BR`);
    await expectPortuguese(page);
    await page.getByRole("button", { name: "Abrir a navegação" }).tap();
    const sheet = page.getByRole("dialog", { name: "Navegação" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Avaliações" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expectNoEnglish(page);
  });
});

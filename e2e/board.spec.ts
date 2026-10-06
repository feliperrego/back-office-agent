import { expect, test, type Locator, type Page } from "@playwright/test";
import { boardData, SUPPORT_ASSISTANT_URL } from "@/lib/board/board";
import { readCaseSet } from "@/lib/eval/cases";
import { EVALS_PAGE, type BackOfficeCase, type BackOfficeResult } from "@/lib/eval/project";
import { readShownRun } from "@/lib/eval/runs";
import { REQUESTS } from "@/lib/sandbox/requests";
import { storeData } from "@/lib/store/customers";
import {
  expectNoEnglish,
  expectPortuguese,
  header,
  MIN_TARGET_PX,
  waitForHydration,
} from "./helpers/i18n";

// The Board (P2's spec §1 item 1, §6; P2-03, P2-04, P2-05): the production build in mock mode
// shows the committed mock run, so each card sits in the lane its case expects and carries no
// mark. What each lane should hold comes from the same data the page reads (lib/board/board.ts),
// so the spec holds when a real run replaces the mock one; the words are literals, so a rewording
// fails here.

const LANES_EN = ["Open", "Done", "Answered", "Declined", "Manual handling"];
const MOCK_NOTE_EN =
  "Mock run: each card sits in the lane where its request is expected to end. Nothing is measured yet.";
const BANNER_EN =
  "A fictional store: some of these requests came from Acme Outfitters Support, and the agent changes nothing until a person approves it.";

const shown = readShownRun<BackOfficeResult>();
const board = boardData({
  requests: REQUESTS,
  customers: storeData.customers,
  cases: readCaseSet<BackOfficeCase>().cases,
  run: shown.run,
  caseHref: EVALS_PAGE.caseHref,
});

const lanes = (page: Page) => page.locator("[data-lane]");
const cardOf = (page: Page, id: string) => page.locator(`[data-request="${id}"]`);

async function expectTarget(locator: Locator, name: string): Promise<void> {
  const box = await locator.boundingBox();
  expect(box?.height, `height of ${name}`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
}

async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
}

test("the Board shows the banner, the run's headline and five lanes holding the 19 requests", async ({
  page,
}) => {
  await page.goto("/");
  await waitForHydration(page);
  await expect(page.getByRole("heading", { level: 2, name: "Board" })).toBeVisible();
  await expect(header(page)).toHaveAttribute("data-mock", "");
  // The nav: Board, current, then Evals.
  const nav = page.getByRole("navigation", { name: "Pages" });
  await expect(nav.getByRole("link")).toHaveText(["Board", "Evals"]);
  await expect(nav.locator('[aria-current="page"]')).toHaveAttribute("href", "/");
  // The banner links P1, where some requests came from.
  await expect(page.getByTestId("banner")).toHaveText(BANNER_EN);
  await expect(
    page.getByTestId("banner").getByRole("link", { name: "Acme Outfitters Support" }),
  ).toHaveAttribute("href", SUPPORT_ASSISTANT_URL);

  // A mock run shows the template's statement, never a rate, and says what the lanes are.
  if (shown.run.mock) {
    const { cases, passed } = shown.run.summary!;
    await expect(page.getByTestId("board-headline")).toHaveText(
      `Mock run: ${passed} of ${cases} mock answers passed the grader. No measurement yet.`,
    );
    await expect(page.getByTestId("board-note")).toHaveText(MOCK_NOTE_EN);
  }
  await expect(page.getByRole("link", { name: "How it's measured" })).toHaveAttribute(
    "href",
    EVALS_PAGE.evalsHref,
  );

  await expect(lanes(page)).toHaveCount(5);
  await expect(lanes(page).locator("h3")).toHaveText(
    LANES_EN.map((name) => new RegExp(`^${name}`)),
  );
  for (const [index, lane] of board.lanes.entries()) {
    const shownLane = lanes(page).nth(index);
    await expect(shownLane).toHaveAttribute("data-lane", lane.id);
    await expect(shownLane.locator("[data-request]")).toHaveCount(lane.cards.length);
    await expect(shownLane.getByTestId("lane-count")).toHaveText(String(lane.cards.length));
    for (const card of lane.cards) await expect(cardOf(page, card.id)).toBeVisible();
  }
  await expect(page.locator("[data-request]")).toHaveCount(19);
  // The reject cases reuse r03's and r02's texts: they show only on /evals.
  await expect(page.locator('[data-request="r20"], [data-request="r21"]')).toHaveCount(0);
  if (shown.run.mock) await expect(page.locator("[data-matched]")).toHaveCount(0);
});

test("a card names its request, customer, reason, order and note, and links its page and its source", async ({
  page,
}) => {
  await page.goto("/");
  await waitForHydration(page);
  const r01 = cardOf(page, "r01");
  await expect(r01).toContainText("Sofia Ramirez");
  await expect(r01).toContainText("Refund");
  await expect(r01).toContainText("No order given");
  await expect(r01.locator('p[lang="en"]')).toHaveText(REQUESTS[0].note);
  const source = r01.getByRole("link", { name: "From Support, ticket t15: open its conversation" });
  await expect(source).toHaveText("From Support · t15");
  await expect(source).toHaveAttribute("href", `${SUPPORT_ASSISTANT_URL}/inbox/t15`);
  await expect(cardOf(page, "r02")).toContainText("AO-10583");
  await expect(cardOf(page, "r03")).toContainText("Written for this demo");
  await expect(cardOf(page, "r03").getByRole("link")).toHaveCount(1);

  await r01.getByRole("link", { name: "Open request r01, from Sofia Ramirez" }).click();
  await expect(page).toHaveURL(/\/requests\/r01$/);
  await expect(page.getByRole("heading", { level: 2, name: /^Request r01/ })).toBeVisible();
  await page.getByRole("link", { name: "Board" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(lanes(page)).toHaveCount(5);
});

test("in Portuguese the Board shows no English interface text", async ({ page }) => {
  await page.goto("/?lang=pt-BR");
  await expectPortuguese(page);
  await expect(page.getByRole("heading", { level: 2, name: "Quadro" })).toBeVisible();
  await expect(lanes(page).locator("h3")).toHaveText([
    /^Aberta/,
    /^Concluída/,
    /^Respondida/,
    /^Recusada/,
    /^Tratamento manual/,
  ]);
  await expect(cardOf(page, "r01")).toContainText("Reembolso");
  await expectNoEnglish(page);
});

/**
 * Each card's problems at this size: its link to the request narrower than the customer's name
 * on one line (the name would stack a letter per line), or a descendant that reaches past the
 * card's edges. Empty when the card lays out well.
 */
async function cardLayoutProblems(page: Page): Promise<string[]> {
  return page.locator("[data-request]").evaluateAll((cards) =>
    cards.flatMap((card) => {
      const id = card.getAttribute("data-request");
      const problems: string[] = [];
      const box = card.getBoundingClientRect();
      const link = card.querySelector<HTMLElement>(`a[href="/requests/${id}"]`);
      const name = link?.lastElementChild as HTMLElement | null | undefined;
      if (!link || !name) return [`${id}: no link with the customer's name`];
      // The name's width on one line, in the link's own font.
      const probe = name.cloneNode(true) as HTMLElement;
      Object.assign(probe.style, {
        position: "absolute",
        visibility: "hidden",
        whiteSpace: "nowrap",
      });
      link.appendChild(probe);
      const natural = probe.getBoundingClientRect().width;
      probe.remove();
      const shown = name.getBoundingClientRect().width;
      if (shown + 0.5 < natural) {
        problems.push(
          `${id}: the name is ${Math.round(shown)} px wide, needs ${Math.round(natural)}`,
        );
      }
      for (const element of card.querySelectorAll<HTMLElement>("*")) {
        const each = element.getBoundingClientRect();
        if (each.width === 0) continue;
        if (each.right > box.right + 0.5 || each.left < box.left - 0.5) {
          problems.push(`${id}: a ${element.tagName.toLowerCase()} reaches past the card`);
        }
      }
      return problems;
    }),
  );
}

// The Board on the laptop and tablet widths where its lanes sit side by side: every card keeps
// its customer's name on one line and nothing reaches past it, in both languages, and the page
// never scrolls sideways.
for (const width of [768, 1024, 1280, 1440, 1536]) {
  test(`at ${width} px every card keeps its name on one line and its content inside`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/?lang=pt-BR"]) {
      await page.goto(path);
      await waitForHydration(page);
      await expect(page.locator("[data-request]")).toHaveCount(19);
      expect(await cardLayoutProblems(page), path).toEqual([]);
      await expectNoSidewaysScroll(page);
      const main = await page.locator("main").evaluate((element) => ({
        scroll: element.scrollWidth,
        client: element.clientWidth,
      }));
      expect(main.scroll, `${path}: the main column scrolls sideways`).toBeLessThanOrEqual(
        main.client,
      );
    }
  });
}

test.describe("a phone at 375×812 with touch", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test("the lanes stack, every link is a 44 px target, and nothing scrolls sideways", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForHydration(page);
    await expectNoSidewaysScroll(page);
    // One column: every lane starts at the same left edge and spans the same width.
    const boxes = await lanes(page).evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { x: Math.round(box.x), width: Math.round(box.width), y: box.y };
      }),
    );
    expect(new Set(boxes.map(({ x }) => x)).size).toBe(1);
    expect(new Set(boxes.map(({ width }) => width)).size).toBe(1);
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].y).toBeGreaterThan(boxes[i - 1].y);

    const r01 = cardOf(page, "r01");
    await expectTarget(r01.getByRole("link", { name: /^Open request r01/ }), "the card's link");
    await expectTarget(r01.getByRole("link", { name: /^From Support/ }), "the source link");
    await expectTarget(
      page.getByTestId("banner").getByRole("link", { name: "Acme Outfitters Support" }),
      "the banner's link",
    );

    await page.getByRole("button", { name: "PT", exact: true }).tap();
    await expectPortuguese(page);
    await expectNoSidewaysScroll(page);
  });
});

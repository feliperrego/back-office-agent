import { expect, test, type Locator, type Page } from "@playwright/test";
import { DENIED_ANSWER } from "@/lib/ai/mock-scenarios";
import {
  answerText,
  assistantBubbles,
  banner,
  composer,
  conversation,
  isChatPost,
  regenerateButtons,
  retryButton,
  statusRegion,
  userBubbles,
  type ChatRequestBody,
} from "./helpers/chat";
import {
  HANDLE_EN,
  HANDLE_MESSAGE_EN,
  HANDLE_PT,
  WAITING_EN,
  WAITING_PT,
} from "./helpers/fixtures";
import { expectNoEnglish, expectPortuguese, MIN_TARGET_PX } from "./helpers/i18n";

// The approval round trip in the browser (P2's spec §1 items 2–3, §4.4, §4.5, §6; P2-10, P2-11,
// P2-21): the production build in mock mode, where "Handle this request." reads the request, then
// proposes the write its frozen case expects (lib/ai/mock-scenarios.ts). r01 proposes a return
// authorization on AO-10468; r02 a size change on AO-10583. The card waits for the person, the
// composer says so, and the answer continues the same message; the request pane shows the orders
// as the conversation leaves them. The words are literals, so a rewording fails here.

/** A tool-authorizeReturn or tool-changeItem part, as the browser posts it. */
type PostedToolPart = { type: string; state?: string; approval?: { approved?: boolean } };

const callOf = (page: Page, tool: string) => page.locator(`[data-tool="${tool}"]`);
const card = (page: Page) => page.locator("[data-approval-card]");
const handleButton = (page: Page, name = HANDLE_EN) =>
  page.getByRole("button", { name, exact: true });
const resultLine = (page: Page, tool: string) =>
  page.locator(`li:has([data-tool="${tool}"]) [data-approval-result]`);
const pane = (page: Page) => page.getByTestId("request-pane");
const orderOf = (page: Page, id: string) => page.locator(`[data-order="${id}"]`);

/** Waits until no request is in flight, in either language: the conversation is not busy. */
async function waitUntilIdle(page: Page): Promise<void> {
  await expect(conversation(page)).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
}

/** Sends "Handle this request." with the page's button and waits for the card. */
async function handle(page: Page, name = HANDLE_EN): Promise<void> {
  await handleButton(page, name).click();
  await expect(card(page)).toBeVisible({ timeout: 20_000 });
  await waitUntilIdle(page);
}

/** While a card waits: the composer is read-only and says why, and nothing else can be sent. */
async function expectWaiting(page: Page, notice: string): Promise<void> {
  const input = composer(page);
  await expect(input).toHaveAttribute("readonly", "");
  await expect(input).toHaveAttribute("aria-disabled", "true");
  const describedBy = await input.getAttribute("aria-describedby");
  expect(describedBy).not.toBeNull();
  await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(notice);
  await expect(regenerateButtons(page)).toHaveCount(0);
}

/** After an answer: the composer takes text again, and Regenerate stays hidden. */
async function expectDecided(page: Page): Promise<void> {
  await expect(composer(page)).not.toHaveAttribute("readonly", "");
  await expect(composer(page)).not.toHaveAttribute("aria-describedby");
  await expect(regenerateButtons(page)).toHaveCount(0);
}

function writePart(body: ChatRequestBody, tool: string): PostedToolPart | undefined {
  const last = body.messages.at(-1);
  return (last?.parts as PostedToolPart[] | undefined)?.find(({ type }) => type === `tool-${tool}`);
}

test("approve: the card shows the change, the answer continues, the write runs and the order shows it", async ({
  page,
}) => {
  await page.goto("/requests/r01");
  await expect(composer(page)).not.toHaveAttribute("readonly", "");
  await handle(page);
  // The button sent its message as the person's.
  await expect(userBubbles(page)).toHaveText([HANDLE_MESSAGE_EN]);

  // Text first, then the read's chip, then the card where the write's chip will be.
  await expect(callOf(page, "readRequest")).toHaveAttribute("data-tool-state", "done");
  await expect(callOf(page, "authorizeReturn")).toHaveAttribute(
    "data-tool-state",
    "awaiting-approval",
  );
  const shown = card(page);
  await expect(shown.getByRole("heading", { level: 3 })).toHaveText(
    "Return authorization: AO-10468",
  );
  await expect(shown.locator("dt")).toHaveText([
    "Return",
    "Refund due on arrival",
    "Return shipping",
    "Request",
  ]);
  await expect(shown.locator("dd")).toHaveText([
    "— → Authorized",
    "$149.00 to the original payment method",
    "paid by the customer",
    "Open → Done",
  ]);
  await expect(shown).toContainText("Policy check");
  await expect(shown).toContainText("day 9 of 30 since delivery on Sep 22, 2026");
  await expect(shown).toContainText("Needs your judgement");
  await expect(shown).toContainText("Unused, with tags: the customer's word");
  await expect(statusRegion(page)).toHaveText("Approval needed");
  await expectWaiting(page, WAITING_EN);
  await expect(handleButton(page)).toBeDisabled();
  await expect(pane(page).getByTestId("request-status")).toHaveText("Open");

  // The answer continues the same message, with the request and the interface language.
  const posted = page.waitForRequest(isChatPost);
  await shown.getByRole("button", { name: "Approve" }).click();
  const body = (await posted).postDataJSON() as ChatRequestBody & { requestId?: string };
  expect(body.trigger).toBe("submit-message");
  expect(body.requestId).toBe("r01");
  expect(body.locale).toBe("en");
  expect(body.messages.map(({ role }) => role)).toEqual(["user", "assistant"]);
  expect(writePart(body, "authorizeReturn")).toMatchObject({
    state: "approval-responded",
    approval: { approved: true },
  });

  await expect(callOf(page, "authorizeReturn")).toHaveAttribute("data-tool-state", "done", {
    timeout: 20_000,
  });
  await waitUntilIdle(page);
  await expect(card(page)).toHaveCount(0);
  await expect(resultLine(page, "authorizeReturn")).toHaveText("Applied · approved by you");
  await expect(answerText(assistantBubbles(page))).toHaveText(
    "Applied. Request r01 is now done (return-authorized).",
  );
  await expect(assistantBubbles(page)).toHaveCount(1);
  await expect(statusRegion(page)).toHaveText("Response complete");
  await expectDecided(page);
  // The request pane shows the sandbox as the conversation leaves it.
  await expect(pane(page).getByTestId("request-status")).toHaveText("Done");
  await expect(orderOf(page, "AO-10468").getByTestId("return-authorized")).toHaveText(
    "Return authorized: $149.00 due on arrival",
  );
});

test("reject: the write is denied, the agent replies and proposes nothing after; the gate blocks a retry", async ({
  page,
}) => {
  await page.goto("/requests/r02");
  await handle(page);
  await expect(card(page).getByRole("heading", { level: 3 })).toHaveText("Order change: AO-10583");
  await expect(card(page).locator("dd").first()).toHaveText("Men's M, Black → Men's L, Black");

  const posted = page.waitForRequest(isChatPost);
  await card(page).getByRole("button", { name: "Reject" }).click();
  const body = (await posted).postDataJSON() as ChatRequestBody;
  expect(writePart(body, "changeItem")).toMatchObject({
    state: "approval-responded",
    approval: { approved: false },
  });

  await expect(callOf(page, "changeItem")).toHaveAttribute("data-tool-state", "denied", {
    timeout: 20_000,
  });
  await waitUntilIdle(page);
  await expect(resultLine(page, "changeItem")).toHaveText("Rejected by you");
  await expect(answerText(assistantBubbles(page))).toHaveText(DENIED_ANSWER);
  // Nothing proposed after the rejection: the read and the rejected write, no card.
  await expect(assistantBubbles(page).locator("[data-tool]")).toHaveCount(2);
  await expect(card(page)).toHaveCount(0);
  await expectDecided(page);
  await expect(pane(page).getByTestId("request-status")).toHaveText("Open");
  await expect(
    orderOf(page, "AO-10583").locator('[data-item="Acme Loft Insulated Jacket"] [data-variant]'),
  ).toHaveText("Men's M, Black");

  // Asked again in the same conversation, the agent's write never reaches a card: the gate
  // denies any write after a person's rejection (spec §3 B7).
  await handleButton(page).click();
  await expect(assistantBubbles(page)).toHaveCount(2, { timeout: 20_000 });
  await waitUntilIdle(page);
  const second = assistantBubbles(page).nth(1);
  await expect(second.locator('[data-tool="changeItem"]')).toHaveAttribute(
    "data-tool-state",
    "denied",
  );
  await expect(second.locator("[data-approval-result]")).toHaveText(
    "Blocked by policy: a person rejected a change in this conversation",
  );
  await expect(card(page)).toHaveCount(0);
  await expect(pane(page).getByTestId("request-status")).toHaveText("Open");
});

test("Retry after a failed continuation continues the answer instead of regenerating it", async ({
  page,
}) => {
  await page.goto("/requests/r01");
  await handle(page);
  // The continuation fails once, as a lost connection or a provider error would.
  let failed = false;
  await page.route("**/api/chat", async (route) => {
    if (failed) return route.continue();
    failed = true;
    await route.fulfill({ status: 500, contentType: "text/plain", body: "Upstream failed." });
  });
  await card(page).getByRole("button", { name: "Approve" }).click();
  await expect(banner(page)).toBeVisible();
  // The approved write did not run: it shows as not finished, and the composer takes no answer.
  await expect(callOf(page, "authorizeReturn")).toHaveAttribute("data-tool-state", "interrupted");
  await expect(regenerateButtons(page)).toHaveCount(0);

  const posted = page.waitForRequest(isChatPost);
  await retryButton(page).click();
  const body = (await posted).postDataJSON() as ChatRequestBody;
  // A continuation: the same history, ending with the answer that holds the approval.
  expect(body.trigger).toBe("submit-message");
  expect(body.messages.map(({ role }) => role)).toEqual(["user", "assistant"]);
  expect(writePart(body, "authorizeReturn")).toMatchObject({
    state: "approval-responded",
    approval: { approved: true },
  });

  await expect(callOf(page, "authorizeReturn")).toHaveAttribute("data-tool-state", "done", {
    timeout: 20_000,
  });
  await waitUntilIdle(page);
  await expect(banner(page)).toHaveCount(0);
  await expect(resultLine(page, "authorizeReturn")).toHaveText("Applied · approved by you");
  await expect(assistantBubbles(page)).toHaveCount(1);
});

test("in Portuguese the request page, its card and its result show no English interface text", async ({
  page,
}) => {
  await page.goto("/requests/r01?lang=pt-BR");
  await expectPortuguese(page);
  await expectNoEnglish(page);
  await handle(page, HANDLE_PT);
  await expect(card(page).locator("dt")).toHaveText([
    "Devolução",
    "Reembolso na chegada da devolução",
    "Frete da devolução",
    "Solicitação",
  ]);
  await expect(card(page)).toContainText("dia 9 de 30 desde a entrega em 22 de set. de 2026");
  await expect(statusRegion(page)).toHaveText("Aprovação necessária");
  await expectWaiting(page, WAITING_PT);
  await expectNoEnglish(page);

  await card(page).getByRole("button", { name: "Aprovar" }).click();
  await expect(resultLine(page, "authorizeReturn")).toHaveText("Aplicada · aprovada por você", {
    timeout: 20_000,
  });
  await waitUntilIdle(page);
  await expect(pane(page).getByTestId("request-status")).toHaveText("Concluída");
  await expect(orderOf(page, "AO-10468").getByTestId("return-authorized")).toHaveText(
    "Devolução autorizada: US$ 149,00 na chegada",
  );
  await expectNoEnglish(page);
});

test.describe("a phone at 375×812 with touch", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  async function expectNoSidewaysScroll(page: Page): Promise<void> {
    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  }

  async function height(locator: Locator): Promise<number> {
    return (await locator.boundingBox())?.height ?? 0;
  }

  test("the request collapses, Handle this request stays in view, and the card's rows and buttons stack", async ({
    page,
  }) => {
    await page.goto("/requests/r01");
    const toggle = page.getByRole("button", { name: "Show the request" });
    const details = page.getByTestId("request-details");
    // Collapsed by default, with the main action in view.
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(details).toBeHidden();
    await expect(handleButton(page)).toBeInViewport();
    expect(await height(toggle)).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    expect(await height(handleButton(page))).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    await expectNoSidewaysScroll(page);

    await toggle.tap();
    const hide = page.getByRole("button", { name: "Hide the request" });
    await expect(hide).toHaveAttribute("aria-expanded", "true");
    await expect(details).toBeVisible();
    await expect(details.locator('blockquote[lang="en"]').first()).toHaveText(
      "The rain jacket from my last delivery doesn't fit me. I'd like a refund, please.",
    );
    await expect(handleButton(page)).toBeInViewport();

    // The first send closes it again, so the conversation has the room.
    await handleButton(page).tap();
    await expect(card(page)).toBeVisible({ timeout: 20_000 });
    await expect(details).toBeHidden();
    await expect(page.getByRole("button", { name: "Show the request" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    // The card's rows stack: each value starts below its label, at the same left edge.
    const label = await card(page).locator("dt").first().boundingBox();
    const value = await card(page).locator("dd").first().boundingBox();
    expect(value!.y).toBeGreaterThanOrEqual(label!.y + label!.height - 1);
    expect(Math.abs(value!.x - label!.x)).toBeLessThanOrEqual(1);
    // Approve and Reject: 44 px tall, one above the other, as wide as the card's content.
    const approve = card(page).getByRole("button", { name: "Approve" });
    const reject = card(page).getByRole("button", { name: "Reject" });
    const row = await approve.locator("xpath=..").boundingBox();
    for (const button of [approve, reject]) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      expect(Math.abs(box!.width - row!.width)).toBeLessThanOrEqual(1);
    }
    expect((await reject.boundingBox())!.y).toBeGreaterThan((await approve.boundingBox())!.y);
    await expectNoSidewaysScroll(page);

    await approve.tap();
    await expect(resultLine(page, "authorizeReturn")).toHaveText("Applied · approved by you", {
      timeout: 20_000,
    });
    await expectNoSidewaysScroll(page);
  });
});

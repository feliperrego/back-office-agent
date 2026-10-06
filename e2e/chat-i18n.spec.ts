import { expect, test, type Page } from "@playwright/test";
import { SLOW_TRIGGER } from "@/lib/ai/mock-steps";
import {
  answerText,
  assistantBubbles,
  banner,
  composer,
  conversation,
  newChatButton,
  postedBody,
  promptButton,
  scroller,
  statusRegion,
  userBubbles,
} from "./helpers/chat";
import {
  CHAT_PATH,
  EMPTY_EN,
  EMPTY_PT,
  LIMIT_TEXT_EN,
  LIMIT_TEXT_PT,
  PROMPTS_EN,
  PROMPTS_PT,
  RATE_NOTE_EN,
  RATE_NOTE_PT,
} from "./helpers/fixtures";
import {
  expectEnglish,
  englishLeftovers,
  expectNoEnglish,
  expectPortuguese,
  footer,
  switchButton,
  waitForHydration,
  MIN_TARGET_PX,
} from "./helpers/i18n";

// E2E for the chat in each interface language (X-01 design §6): the production build in mock
// mode. The page is prerendered in English and switches after hydration, so Portuguese is
// asserted web-first only, and English only once the page has hydrated. Language tests that
// hold on a page with no chat belong in the site-level spec, not here (X-01 design §6).

const SLOW_QUESTION = `${PROMPTS_EN[0]} ${SLOW_TRIGGER}`;

// What the empty state shows and what a phone taps, in each language.
type UiStrings = {
  title: string;
  subtitle: string;
  rateNote: string;
  prompts: readonly string[];
  newChat: string;
  send: string;
  stop: string;
};
const UI_EN: UiStrings = {
  ...EMPTY_EN,
  rateNote: RATE_NOTE_EN,
  prompts: PROMPTS_EN,
  newChat: "New chat",
  send: "Send message",
  stop: "Stop generating",
};
const UI_PT: UiStrings = {
  ...EMPTY_PT,
  rateNote: RATE_NOTE_PT,
  prompts: PROMPTS_PT,
  newChat: "Nova conversa",
  send: "Enviar mensagem",
  stop: "Parar geração",
};

async function sendPortuguese(page: Page, text: string): Promise<void> {
  await composer(page).fill(text);
  await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
}

/**
 * The empty state: the title as the <h2>, the subtitle, the prompts in order (the only buttons
 * in <main>), and the rate note.
 */
async function expectEmptyState(page: Page, strings: UiStrings): Promise<void> {
  await expect(
    page.getByRole("heading", { level: 2, name: strings.title, exact: true }),
  ).toBeVisible();
  for (const text of [strings.subtitle, strings.rateNote]) {
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("main").getByRole("button")).toHaveText([...strings.prompts]);
}

/**
 * A phone: the prompts, New chat, EN and PT are at least 44 px tall, and the page does not
 * scroll sideways. The sizes come from CSS, so they are the same before and after hydration.
 */
async function expectPhoneLayout(page: Page, strings: UiStrings): Promise<void> {
  for (const name of [...strings.prompts, strings.newChat, "EN", "PT"]) {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(box?.height, `height of "${name}"`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  }
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
}

/**
 * After a conversation more than a view taller than the screen, New chat shows the empty state
 * from its title. The mock's [[slow]] answer is stopped once it is that tall.
 */
async function expectNewChatOpensAtTitle(page: Page, strings: UiStrings): Promise<void> {
  await composer(page).tap();
  await composer(page).fill(SLOW_QUESTION);
  await page.getByRole("button", { name: strings.send, exact: true }).tap();
  // The view follows the stream, so this waits until it is more than a full view down.
  await expect
    .poll(() => scroller(page).evaluate((element) => element.scrollTop - element.clientHeight), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: strings.stop, exact: true }).tap();

  await newChatButton(page, strings.newChat).tap();
  await expect(conversation(page)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 2, name: strings.title, exact: true }),
  ).toBeInViewport({ ratio: 1 });
}

test("1. / shows the English empty state: title, subtitle, the prompts and the rate note", async ({
  page,
}) => {
  await page.goto(CHAT_PATH);
  await waitForHydration(page);
  await expectEmptyState(page, UI_EN);
});

test("2. PT translates the empty state, New chat and the placeholder", async ({ page }) => {
  await page.goto(CHAT_PATH);
  await waitForHydration(page);
  await switchButton(page, "PT").click();
  await expectPortuguese(page);

  await expectEmptyState(page, UI_PT);
  await expect(newChatButton(page, "Nova conversa")).toBeVisible();
  await expect(composer(page)).toHaveAttribute("placeholder", "Envie uma mensagem");
});

test("2. PT sweep: no English interface string on the empty state, after a Stop or under the error banner", async ({
  page,
}) => {
  await page.goto(CHAT_PATH);
  await waitForHydration(page);
  // Control: in English the sweep finds the dictionary's text, placeholders and aria-labels.
  await expect
    .poll(() => englishLeftovers(page))
    .toEqual(expect.arrayContaining([UI_EN.title, "Send a message", "Language"]));

  await switchButton(page, "PT").click();
  await expectPortuguese(page);
  await expectNoEnglish(page);

  // A stopped answer: its caption, Regenerate and the stopped announcement.
  await sendPortuguese(page, SLOW_QUESTION);
  const bubble = assistantBubbles(page);
  await expect(bubble).toHaveCount(1);
  await page.getByRole("button", { name: "Parar geração", exact: true }).click();
  await expect(bubble.getByText("Interrompida", { exact: true })).toBeVisible();
  await expect(bubble.getByRole("button", { name: "Gerar novamente", exact: true })).toBeVisible();
  await expect(statusRegion(page)).toHaveText("Resposta interrompida");
  await expect(conversation(page)).toHaveAccessibleName("Conversa");
  await expect(composer(page)).toHaveAccessibleName("Mensagem");
  await expect(newChatButton(page, "Nova conversa")).toBeVisible();
  await expect(footer(page)).toContainText("Feito por");
  await expect(footer(page)).toContainText("Código no GitHub");
  await expectNoEnglish(page);

  // A failed request: the generic banner, its Retry and the failed announcement.
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 500,
      contentType: "text/plain; charset=utf-8",
      body: "Internal Server Error",
    }),
  );
  await sendPortuguese(page, "Olá");
  await expect(banner(page)).toContainText(
    "Não foi possível obter uma resposta. Verifique sua conexão e tente de novo.",
  );
  await expect(
    banner(page).getByRole("button", { name: "Tentar de novo", exact: true }),
  ).toBeVisible();
  await expect(statusRegion(page)).toHaveText("Falha na resposta");
  await expectNoEnglish(page);
});

test("5. removing lang keeps the page: no reload, no router request; Back then Forward reopens / in English", async ({
  page,
}) => {
  await page.goto(`${CHAT_PATH}?lang=pt-BR`);
  await expectPortuguese(page);
  await composer(page).fill(PROMPTS_EN[0]);
  await composer(page).press("Enter");
  await expect(assistantBubbles(page)).toHaveCount(1);
  // aria-busy turns false once the answer has finished streaming.
  await expect(conversation(page)).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
  const answer = await answerText(assistantBubbles(page)).innerText();

  // A reload, or any other document load, would drop this marker.
  await page.evaluate(() => Object.assign(window, { e2eSameDocument: true }));
  const requests: URL[] = [];
  page.on("request", (request) => requests.push(new URL(request.url())));

  await switchButton(page, "EN").click();
  await expectEnglish(page);
  await expect(page).toHaveURL(CHAT_PATH);
  await expect(userBubbles(page)).toHaveText([PROMPTS_EN[0]]);
  await expect(answerText(assistantBubbles(page))).toHaveText(answer);

  // A second answer: the chat still works, and a request the switch started has had time to
  // show up.
  await composer(page).fill(PROMPTS_EN[1]);
  await composer(page).press("Enter");
  await expect(assistantBubbles(page)).toHaveCount(2);
  await expect(conversation(page)).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
  expect(await page.evaluate(() => "e2eSameDocument" in window)).toBe(true);
  // Neither a document request for / nor a Next.js router (RSC) request.
  const pageRequests = requests.filter(
    (url) => url.pathname === CHAT_PATH || url.searchParams.has("_rsc"),
  );
  expect(pageRequests.map(String)).toEqual([]);

  // Back leaves the page (a new context starts on about:blank). Forward loads / as a new
  // document: English, the stored choice, since the history entry no longer holds lang.
  await page.goBack();
  await page.goForward();
  await expect(page).toHaveURL(CHAT_PATH);
  await waitForHydration(page);
  await expectEnglish(page);
});

test("7. a 429 in Portuguese shows the pt-BR limit text, not the English body", async ({
  page,
}) => {
  await page.goto(`${CHAT_PATH}?lang=pt-BR`);
  await expectPortuguese(page);
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 429,
      contentType: "text/plain; charset=utf-8",
      headers: { "Retry-After": "3600" },
      body: LIMIT_TEXT_EN,
    }),
  );
  await composer(page).fill("Olá");
  await composer(page).press("Enter");
  await expect(banner(page)).toHaveText(LIMIT_TEXT_PT);
  await expect(page.getByRole("button", { name: "Tentar de novo", exact: true })).toHaveCount(0);
});

test("the limit banner follows the switch: pt-BR after PT, English again after EN, never Retry", async ({
  page,
}) => {
  await page.goto(CHAT_PATH);
  await waitForHydration(page);
  // In English the client's text equals the server's, so the body here differs from it.
  const serverBody = "server limit text";
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 429,
      contentType: "text/plain; charset=utf-8",
      headers: { "Retry-After": "3600" },
      body: serverBody,
    }),
  );
  await composer(page).fill("Hello");
  await composer(page).press("Enter");
  await expect(banner(page)).toHaveText(LIMIT_TEXT_EN);
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);

  await switchButton(page, "PT").click();
  await expectPortuguese(page);
  await expect(banner(page)).toHaveText(LIMIT_TEXT_PT);
  await expect(page.getByRole("button", { name: "Tentar de novo", exact: true })).toHaveCount(0);

  await switchButton(page, "EN").click();
  await expectEnglish(page);
  await expect(banner(page)).toHaveText(LIMIT_TEXT_EN);
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
});

test("8. a suggested prompt posts its exact text and the locale: en, then pt-BR after PT; Regenerate sends pt-BR too", async ({
  page,
}) => {
  await page.goto(CHAT_PATH);
  await waitForHydration(page);
  // English first: a locale fixed at load, rather than read for each request, fails below.
  const english = await postedBody(page, () => promptButton(page, PROMPTS_EN[0]).click());
  expect(english.locale).toBe("en");
  await newChatButton(page, "New chat").click();

  await switchButton(page, "PT").click();
  await expectPortuguese(page);
  const prompt = PROMPTS_PT[0];
  const sent = await postedBody(page, () => promptButton(page, prompt).click());
  expect(sent.trigger).toBe("submit-message");
  expect(sent.messages.at(-1)?.role).toBe("user");
  expect(sent.messages.at(-1)?.parts).toEqual([{ type: "text", text: prompt }]);
  expect(sent.locale).toBe("pt-BR");

  // Regenerate shows once the mock's default answer is complete, about 5 s after the send.
  const regenerate = assistantBubbles(page).getByRole("button", {
    name: "Gerar novamente",
    exact: true,
  });
  await expect(regenerate).toBeVisible({ timeout: 20_000 });
  await expect(statusRegion(page)).toHaveText("Resposta concluída");
  const regenerated = await postedBody(page, () => regenerate.click());
  expect(regenerated.trigger).toBe("regenerate-message");
  expect(regenerated.messages.at(-1)?.parts).toEqual([{ type: "text", text: prompt }]);
  expect(regenerated.locale).toBe("pt-BR");
});

test("PT while an answer streams renames Stop; the stopped request sent en, its Regenerate sends pt-BR", async ({
  page,
}) => {
  await page.goto(CHAT_PATH);
  await waitForHydration(page);
  const english = await postedBody(page, async () => {
    await composer(page).fill(SLOW_QUESTION);
    await composer(page).press("Enter");
  });
  // Sent before the switch.
  expect(english.locale).toBe("en");
  // The bubble shows once text has arrived; aria-busy stays true while the answer streams.
  const bubble = assistantBubbles(page);
  await expect(bubble).toHaveCount(1);
  await expect(conversation(page)).toHaveAttribute("aria-busy", "true");

  await switchButton(page, "PT").click();
  await expectPortuguese(page);
  await page.getByRole("button", { name: "Parar geração", exact: true }).click();
  await expect(bubble.getByText("Interrompida", { exact: true })).toBeVisible();

  const regenerated = await postedBody(page, () =>
    bubble.getByRole("button", { name: "Gerar novamente", exact: true }).click(),
  );
  expect(regenerated.trigger).toBe("regenerate-message");
  expect(regenerated.locale).toBe("pt-BR");
});

test.describe("9. a phone at 375×812 with touch", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test("9. 44 px targets, no sideways scroll and New chat back at the title, in English and after tapping PT", async ({
    page,
  }) => {
    await page.goto(CHAT_PATH);
    const isCoarsePointer = await page.evaluate(
      () => window.matchMedia("(pointer: coarse)").matches,
    );
    expect(isCoarsePointer).toBe(true);
    await expectPhoneLayout(page, UI_EN);
    await expectNewChatOpensAtTitle(page, UI_EN);

    await switchButton(page, "PT").tap();
    await expectPortuguese(page);
    await expectPhoneLayout(page, UI_PT);
    await expectNewChatOpensAtTitle(page, UI_PT);
  });
});

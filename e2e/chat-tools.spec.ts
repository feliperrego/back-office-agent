import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  answerText,
  assistantBubbles,
  banner,
  composer,
  conversation,
  fulfillSse,
  postedBody,
  sendText,
  sse,
  stopButton,
  stoppedRow,
  waitForAnswers,
} from "./helpers/chat";
import {
  CHAT_PATH,
  FULL_DEFAULT_ANSWER,
  TOOL_ANSWER,
  TOOL_INPUT_TEXT,
  TOOL_LABEL_EN,
  TOOL_LABEL_PT,
  TOOL_NAME,
  TOOL_OUTPUT_TEXT,
  TOOL_PROMPT,
} from "./helpers/fixtures";
import { expectNoEnglish, expectPortuguese, MIN_TARGET_PX } from "./helpers/i18n";

// A tool call in the chat (template spec §5.10): the production build in mock mode, where a
// message that names an item makes the mock call the project's tool, then answer from its result
// (lib/ai/mock-scenarios.ts). The default renderer shows the call as a chip after the answer's
// text. The project's tool, its labels and its answer come from helpers/fixtures.ts.

// Shell text (lib/i18n/shell-messages.ts), re-declared as literals so that a rewording fails
// here instead of moving with the dictionary.
const INPUT_EN = "Input";
const OUTPUT_EN = "Output";
const INPUT_PT = "Entrada";
const OUTPUT_PT = "Saída";
const RUNNING_EN = "Working";
const NOT_FINISHED_EN = "Not finished";

const chipOf = (bubble: Locator) => bubble.locator(`[data-tool="${TOOL_NAME}"]`);
// The chip's spinner, whose class is motion-safe:animate-spin.
const SPINNER = '[class*="animate-spin"]';

/**
 * Asks the tool question with Enter, so it reads no label of either language, and waits for its
 * answer: one bubble, and aria-busy false once the answer has finished streaming.
 */
async function askWithTool(page: Page): Promise<Locator> {
  await composer(page).fill(TOOL_PROMPT);
  await composer(page).press("Enter");
  await expect(assistantBubbles(page)).toHaveCount(1);
  await expect(conversation(page)).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
  return assistantBubbles(page);
}

test("a tool call shows as a chip after the answer, with its input and output a click away", async ({
  page,
}) => {
  await page.goto(CHAT_PATH);
  const bubble = await askWithTool(page);

  await expect(answerText(bubble)).toHaveText(TOOL_ANSWER);
  const chip = chipOf(bubble);
  await expect(chip).toHaveAttribute("data-tool-state", "done");
  const trigger = chip.getByRole("button");
  await expect(trigger).toHaveText(TOOL_LABEL_EN);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  // The renderer contract: the text first, the caption (Regenerate) last; the chips between.
  const children = bubble.locator(":scope > *");
  await expect(children).toHaveCount(3);
  await expect(children.nth(1).locator(`[data-tool="${TOOL_NAME}"]`)).toHaveCount(1);
  await expect(children.nth(2).getByRole("button", { name: "Regenerate" })).toBeVisible();

  await expect(chip.getByText(TOOL_INPUT_TEXT)).not.toBeVisible();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(chip.getByText(INPUT_EN, { exact: true })).toBeVisible();
  await expect(chip.getByText(OUTPUT_EN, { exact: true })).toBeVisible();
  await expect(chip.getByText(TOOL_INPUT_TEXT)).toBeVisible();
  await expect(chip.getByText(TOOL_OUTPUT_TEXT)).toBeVisible();

  await trigger.click();
  await expect(chip.getByText(TOOL_INPUT_TEXT)).not.toBeVisible();
});

// Chat's default hasContent counts a tool call (template spec §5.8): an answer that is only a
// tool call still shows, with its chip and Regenerate, where text alone would leave it hidden.
test("an answer that is only a tool call still shows, with its chip", async ({ page }) => {
  await page.route("**/api/chat", (route) =>
    fulfillSse(
      route,
      sse([
        { type: "start" },
        { type: "start-step" },
        {
          type: "tool-input-available",
          toolCallId: "call-1",
          toolName: TOOL_NAME,
          input: { itemId: "ITM-0042" },
        },
        { type: "tool-output-available", toolCallId: "call-1", output: { found: true } },
        { type: "finish-step" },
        { type: "finish", finishReason: "tool-calls" },
      ]),
    ),
  );
  await page.goto(CHAT_PATH);
  const bubble = await askWithTool(page);

  await expect(answerText(bubble)).toHaveText("");
  await expect(chipOf(bubble)).toHaveAttribute("data-tool-state", "done");
  await expect(bubble.getByRole("button", { name: "Regenerate" })).toBeVisible();
  await expect(stoppedRow(page)).toHaveCount(0);
});

// While an answer streams, something on screen always says more is coming: the answer's text, a
// chip that spins, or the typing dots. Between the tool's output and the next step's first word,
// the chip is done and there is no text yet, so the dots show again (template spec §5.10).
test("while the answer streams, the dots show whenever neither its text nor a running call does", async ({
  page,
}) => {
  await page.goto(CHAT_PATH);
  // Every state the conversation takes while it is busy, as each render leaves it.
  await page.evaluate(() => {
    const states: string[] = [];
    Object.assign(window, { busyStates: states });
    new MutationObserver(() => {
      if (document.querySelector('[role="log"]')?.getAttribute("aria-busy") !== "true") return;
      const bubble = document.querySelector('[data-message-role="assistant"]');
      const text = bubble?.firstElementChild?.textContent?.trim() ?? "";
      const chip = bubble?.querySelector("[data-tool]")?.getAttribute("data-tool-state") ?? "none";
      const dots = document.querySelector('[data-testid="typing-indicator"]') !== null;
      states.push(
        `${text === "" ? "no text" : "text"}, chip ${chip}, ${dots ? "dots" : "no dots"}`,
      );
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
  });
  const bubble = await askWithTool(page);
  await expect(answerText(bubble)).toHaveText(TOOL_ANSWER);

  const states = await page.evaluate(
    () => (window as unknown as { busyStates: string[] }).busyStates,
  );
  const recorded = `states while busy: ${[...new Set(states)].join(" | ")}`;
  // The gap after the call, which the mock holds open for its first-chunk delay.
  expect(states, recorded).toContain("no text, chip done, dots");
  // Never a moment with no text, no running call and no dots.
  const blank = states.filter(
    (state) =>
      state.startsWith("no text") && !state.includes("chip running") && state.endsWith("no dots"),
  );
  expect(blank, recorded).toEqual([]);
});

// The route sends the model the text of earlier answers only (template spec §5.8, step 3), so a
// history that holds a tool call is posted, accepted and answered like any other.
test("a follow-up after a tool answer posts the call in the history and gets its answer", async ({
  page,
}) => {
  await page.goto(CHAT_PATH);
  await askWithTool(page);

  const body = await postedBody(page, () => sendText(page, "Thanks. Anything else?"));
  const earlier = body.messages[1];
  expect(earlier.role).toBe("assistant");
  expect(earlier.parts.some((part) => part.type === `tool-${TOOL_NAME}`)).toBe(true);

  await waitForAnswers(page, 2);
  await expect(answerText(assistantBubbles(page).nth(1))).toHaveText(FULL_DEFAULT_ANSWER);
  await expect(chipOf(assistantBubbles(page).nth(0))).toHaveCount(1);
  await expect(chipOf(assistantBubbles(page).nth(1))).toHaveCount(0);
});

test("in Portuguese the chip's label and headings are Portuguese, and the tool's data stays English", async ({
  page,
}) => {
  await page.goto(`${CHAT_PATH}?lang=pt-BR`);
  await expectPortuguese(page);
  const bubble = await askWithTool(page);

  const chip = chipOf(bubble);
  const trigger = chip.getByRole("button");
  await expect(trigger).toHaveText(TOOL_LABEL_PT);
  await trigger.click();
  await expect(chip.getByText(INPUT_PT, { exact: true })).toBeVisible();
  await expect(chip.getByText(OUTPUT_PT, { exact: true })).toBeVisible();
  await expect(chip.locator('pre[lang="en"]')).toHaveCount(2);
  await expectNoEnglish(page);
});

// The SDK leaves a tool part as it was when the request ends early, so a call cut off by Stop, an
// error or a server timeout would spin for the rest of the visit. Once the answer no longer
// streams, the chip says the call did not finish (template spec §5.10).
test.describe("a call the end of the request cuts off", () => {
  /** The answer's first chunks: a step that calls the tool, whose output never comes. */
  const CALL_STARTED = [
    { type: "start" },
    { type: "start-step" },
    {
      type: "tool-input-available",
      toolCallId: "call-1",
      toolName: TOOL_NAME,
      input: { itemId: "ITM-0042" },
    },
  ];

  async function expectNotFinished(bubble: Locator): Promise<void> {
    const chip = chipOf(bubble);
    await expect(chip).toHaveAttribute("data-tool-state", "interrupted");
    await expect(chip.locator(SPINNER)).toHaveCount(0);
    await expect(chip.getByRole("button")).toContainText(NOT_FINISHED_EN);
    await expect(chip.getByRole("button")).not.toContainText(RUNNING_EN);
  }

  for (const [ending, last] of [
    ["an error chunk", { type: "error", errorText: "The tool's service is down." }],
    ["an abort chunk, a server timeout", { type: "abort", reason: "TimeoutError: chunk timeout" }],
  ] as const) {
    test(`after ${ending} the call shows as not finished, with no spinner`, async ({ page }) => {
      await page.route("**/api/chat", (route) => fulfillSse(route, sse([...CALL_STARTED, last])));
      await page.goto(CHAT_PATH);
      await composer(page).fill(TOOL_PROMPT);
      await composer(page).press("Enter");
      await expect(banner(page)).toBeVisible();
      await expect(assistantBubbles(page)).toHaveCount(1);
      await expectNotFinished(assistantBubbles(page));
    });
  }

  test("after Stop the call shows as not finished, with no spinner", async ({ page }) => {
    // A request that streams the call, then stays open until it is aborted: route.fulfill sends
    // a whole body at once, so the page's own fetch answers /api/chat here.
    await page.addInitScript((frames: string) => {
      const pageFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        if (new URL(url, window.location.href).pathname !== "/api/chat") {
          return pageFetch(input, init);
        }
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(frames));
            init?.signal?.addEventListener("abort", () =>
              controller.error(new DOMException("The request was aborted.", "AbortError")),
            );
          },
        });
        return Promise.resolve(
          new Response(body, {
            headers: {
              "content-type": "text/event-stream",
              "x-vercel-ai-ui-message-stream": "v1",
            },
          }),
        );
      };
    }, sse(CALL_STARTED).replace("data: [DONE]\n\n", ""));
    await page.goto(CHAT_PATH);
    await composer(page).fill(TOOL_PROMPT);
    await composer(page).press("Enter");

    const bubble = assistantBubbles(page);
    const chip = chipOf(bubble);
    // The call runs while the request is open.
    await expect(chip).toHaveAttribute("data-tool-state", "running");
    await expect(chip.locator(SPINNER)).toHaveCount(1);

    await stopButton(page).click();
    await expect(bubble.getByText("Stopped", { exact: true })).toBeVisible();
    await expectNotFinished(bubble);
  });
});

test.describe("a phone at 375×812 with touch", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test("the chip is a 44 px target, and its open data never scrolls the page sideways", async ({
    page,
  }) => {
    await page.goto(CHAT_PATH);
    const bubble = await askWithTool(page);

    const trigger = chipOf(bubble).getByRole("button");
    const box = await trigger.boundingBox();
    expect(box?.height, "height of the chip").toBeGreaterThanOrEqual(MIN_TARGET_PX);

    await trigger.tap();
    await expect(chipOf(bubble).getByText(TOOL_OUTPUT_TEXT)).toBeVisible();
    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  });
});

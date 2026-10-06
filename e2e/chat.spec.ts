import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ERROR_TRIGGER, SLOW_TRIGGER } from "@/lib/ai/mock-steps";
import { FIRST_CHUNK_TIMEOUT_MS, MAX_USER_CHARS } from "@/lib/chat/config";
import { MAX_ASSISTANT_CHARS, MAX_MESSAGES } from "@/lib/chat/limits";
import { SEND_DOUBLE_CLICK_MS } from "@/lib/chat/ui";
import {
  annotate,
  answerText,
  assistantBubbles,
  banner,
  composer,
  conversation,
  distanceFromBottom,
  fulfillSse,
  isChatPost,
  jumpButton,
  newChatButton,
  postedBody,
  promptButton,
  regenerateButtons,
  retryButton,
  scrollState,
  scroller,
  sendButton,
  sendText,
  sse,
  statusRegion,
  stopButton,
  stoppedRow,
  textAnswer,
  textLength,
  typingDots,
  userBubbles,
  waitForAnswers,
  waitForScrollToSettle,
  waitUntilIdle,
  type ChatRequestBody,
} from "./helpers/chat";
import {
  CHAT_PATH,
  EMPTY_EN,
  FULL_DEFAULT_ANSWER,
  LIMIT_TEXT_EN,
  PROMPTS_EN,
} from "./helpers/fixtures";
import { header, MIN_TARGET_PX } from "./helpers/i18n";

// E2E for the chat shell (X-01 design §6): the production build in mock mode (AI_MOCK=1), zero
// cost. The mock model's first chunk arrives 600 ms after the request; [[slow]] streams 300
// lines, 30 ms apart; [[error]] fails the first time the server sees a prompt text
// (lib/ai/mock-steps.ts). The project's own text comes from helpers/fixtures.ts.

// The template's mock gives any other text its default answer.
const QUESTION = PROMPTS_EN[0];
const SLOW_QUESTION = `${QUESTION} ${SLOW_TRIGGER}`;
// Shell text (lib/i18n/shell-messages.ts), re-declared as literals so that a rewording fails
// here instead of moving with the dictionary.
const GENERIC_ERROR_TEXT = "Couldn't get a response. Check your connection and try again.";
const CAP_TEXT = "Conversation limit reached. Start a new chat.";
const PLACEHOLDER = "Send a message";

/** The text parts of a posted message, joined. */
function postedText(message: ChatRequestBody["messages"][number]): string {
  return message.parts.map((part) => (part.type === "text" ? (part.text ?? "") : "")).join("");
}

test("1. a suggested prompt streams in word by word, under the mock-model badge", async ({
  page,
}) => {
  await page.goto(CHAT_PATH);
  // Every length the answer's text takes, from its first render to the end of the stream. The
  // observer sees each render, so the check does not depend on where a timed poll lands.
  await page.evaluate(() => {
    const lengths: number[] = [];
    Object.assign(window, { answerLengths: lengths });
    new MutationObserver(() => {
      const answer = document.querySelector('[data-message-role="assistant"] > div');
      if (answer !== null) lengths.push(answer.textContent?.length ?? 0);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await promptButton(page, PROMPTS_EN[0]).click();
  // Sending refocuses the composer on a fine pointer, so typing the next message needs no click.
  await expect(composer(page)).toBeFocused();
  await expect(composer(page)).toHaveAccessibleName("Message");
  await expect(typingDots(page)).toBeVisible();
  await expect(userBubbles(page)).toHaveText([PROMPTS_EN[0]]);

  const bubble = assistantBubbles(page);
  await expect(bubble).toHaveCount(1);
  await waitUntilIdle(page);
  await expect(answerText(bubble)).toHaveText(FULL_DEFAULT_ANSWER);
  await expect(header(page).getByText("Mock model", { exact: true })).toBeVisible();
  // The status line announces the end of the answer, never its tokens.
  await expect(statusRegion(page)).toHaveText("Response complete");

  // The text grew chunk by chunk, from a first word to the whole answer, and never shrank.
  const lengths = await page.evaluate(
    () => (window as unknown as { answerLengths: number[] }).answerLengths,
  );
  const final = await textLength(bubble);
  const recorded = `answer lengths: ${lengths.join(", ")}`;
  for (let i = 1; i < lengths.length; i++) {
    expect(lengths[i], recorded).toBeGreaterThanOrEqual(lengths[i - 1]);
  }
  expect(new Set(lengths).size, recorded).toBeGreaterThan(20);
  expect(lengths[0], recorded).toBeLessThan(final / 4);
  expect(lengths.at(-1), recorded).toBe(final);
});

test.describe("2. stop", () => {
  /**
   * After a Stop: the text no longer grows, it is labeled Stopped, the status line says so, Send
   * is back and the composer has focus.
   */
  async function expectStoppedMidAnswer(page: Page, bubble: Locator): Promise<void> {
    const length = await textLength(bubble);
    await page.waitForTimeout(500);
    expect(await textLength(bubble)).toBe(length);
    await expect(bubble.getByText("Stopped", { exact: true })).toBeVisible();
    await expect(statusRegion(page)).toHaveText("Response stopped");
    await expect(sendButton(page)).toBeVisible();
    await expect(composer(page)).toBeFocused();
  }

  /** The answer keeps streaming: its text grows, Stop stays, and nothing is labeled Stopped. */
  async function expectStillStreaming(page: Page, bubble: Locator): Promise<void> {
    const length = await textLength(bubble);
    await expect.poll(() => textLength(bubble)).toBeGreaterThan(length);
    await expect(stopButton(page)).toBeVisible();
    await expect(bubble.getByText("Stopped", { exact: true })).toHaveCount(0);
  }

  test("the Stop button keeps the partial text, labeled Stopped", async ({ page }) => {
    await page.goto(CHAT_PATH);
    await sendText(page, SLOW_QUESTION);
    const bubble = assistantBubbles(page);
    await expect(bubble).toHaveCount(1);
    await stopButton(page).click();
    await expectStoppedMidAnswer(page, bubble);
  });

  test("Esc stops from anywhere on the page", async ({ page }) => {
    await page.goto(CHAT_PATH);
    await sendText(page, SLOW_QUESTION);
    const bubble = assistantBubbles(page);
    await expect(bubble).toHaveCount(1);
    await composer(page).blur();
    await expect(composer(page)).not.toBeFocused();
    await page.keyboard.press("Escape");
    await expectStoppedMidAnswer(page, bubble);
  });

  test("an Esc another handler already handled does not stop the answer", async ({ page }) => {
    await page.goto(CHAT_PATH);
    // Runs before the chat's listener and marks every Esc as handled, as a popover that closes
    // on Esc does.
    await page.evaluate(() => {
      window.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") event.preventDefault();
        },
        { capture: true },
      );
    });
    await sendText(page, SLOW_QUESTION);
    const bubble = assistantBubbles(page);
    await expect(bubble).toHaveCount(1);
    await composer(page).blur();
    await page.keyboard.press("Escape");

    await expectStillStreaming(page, bubble);
    await stopButton(page).click();
  });

  // A dialog or a drawer that handles Esc on the document adds its listener when it opens, which
  // may be after the chat's. The chat's listener sits on window, so it runs after every listener
  // on the document, whatever order they were added in, and sees the Esc handled (template spec
  // §5.8): an Esc that closes a drawer, or that a drawer keeps for itself, never also stops.
  test("an Esc a document listener added after the send handles does not stop the answer", async ({
    page,
  }) => {
    await page.goto(CHAT_PATH);
    await sendText(page, SLOW_QUESTION);
    const bubble = assistantBubbles(page);
    await expect(bubble).toHaveCount(1);
    // The chat is busy, so its own Esc listener is in place: this one is added after it.
    await page.evaluate(() => {
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") event.preventDefault();
      });
    });
    await composer(page).blur();
    await page.keyboard.press("Escape");

    await expectStillStreaming(page, bubble);
    await stopButton(page).click();
  });

  // A chat in a panel (template spec §5.8): a closed drawer may keep its chat mounted but hidden,
  // display: none, while its answer streams on. Hiding the chat's root the same way stands in for
  // that drawer here, on the full-page chat, so the template ships no test-only page.
  test("a chat that is hidden but still mounted ignores Esc; shown again, Esc stops it", async ({
    page,
  }) => {
    await page.goto(CHAT_PATH);
    await sendText(page, SLOW_QUESTION);
    const bubble = assistantBubbles(page);
    await expect(bubble).toHaveCount(1);
    // CSS locators, which find hidden elements too: Chat's root is the parent of its <main>.
    const chatRoot = page.locator('div:has(> main [role="log"])');
    const log = page.locator('[role="log"]');
    await expect(chatRoot).toHaveCount(1);

    await chatRoot.evaluate((element) => {
      (element as HTMLElement).style.display = "none";
    });
    await expect(log).toBeHidden();
    await page.keyboard.press("Escape");
    // After the time a stop takes to land (as expectStoppedMidAnswer waits), the hidden answer
    // still streams.
    await page.waitForTimeout(500);
    const hiddenLength = await textLength(bubble);
    await expect.poll(() => textLength(bubble)).toBeGreaterThan(hiddenLength);
    await expect(log).toHaveAttribute("aria-busy", "true");
    await expect(bubble.getByText("Stopped", { exact: true })).toHaveCount(0);

    // Shown again, the chat still streams, and Esc stops it.
    await chatRoot.evaluate((element) => {
      (element as HTMLElement).style.display = "";
    });
    await expect(stopButton(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expectStoppedMidAnswer(page, bubble);
  });

  // An IME (Chinese, Japanese or Korean input) may use Esc to cancel a word (template spec §5.8).
  // The keys are dispatched as a browser reports them, since Playwright types no composition.
  test("an Esc inside an IME composition does not stop the answer", async ({ page }) => {
    await page.goto(CHAT_PATH);
    await sendText(page, SLOW_QUESTION);
    const bubble = assistantBubbles(page);
    await expect(bubble).toHaveCount(1);

    // Inside a composition the page saw start, with no isComposing flag on the key.
    await composer(page).evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      element.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }),
      );
    });
    await expectStillStreaming(page, bubble);

    // The control: once the composition is over, Esc stops.
    await composer(page).evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    });
    await page.keyboard.press("Escape");
    await expectStoppedMidAnswer(page, bubble);
  });

  test("Safari's Esc that ends an IME composition, after compositionend, does not stop the answer", async ({
    page,
  }) => {
    await page.goto(CHAT_PATH);
    await sendText(page, SLOW_QUESTION);
    const bubble = assistantBubbles(page);
    await expect(bubble).toHaveCount(1);

    // Safari's order: compositionend, then the Esc's keydown with keyCode 229.
    await composer(page).evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
      element.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", keyCode: 229, bubbles: true }),
      );
    });
    await expectStillStreaming(page, bubble);

    await page.keyboard.press("Escape");
    await expectStoppedMidAnswer(page, bubble);
  });
});

test("3. Stop before the first token shows the stopped row; its Regenerate gives one answer", async ({
  page,
}) => {
  await page.goto(CHAT_PATH);
  await composer(page).fill(QUESTION);
  const sentAt = Date.now();
  await sendButton(page).click();
  await stopButton(page).click();
  annotate("send-to-stop-ms", Date.now() - sentAt);

  await expect(stoppedRow(page)).toHaveText("Stopped before a response · Regenerate");
  // Past the mock's 600 ms first-token delay: nothing arrived.
  await page.waitForTimeout(1000);
  await expect(stoppedRow(page)).toBeVisible();
  await expect(assistantBubbles(page)).toHaveCount(0);

  await stoppedRow(page).getByRole("button", { name: "Regenerate" }).click();
  await expect(stoppedRow(page)).toHaveCount(0);
  await waitForAnswers(page);
  await expect(answerText(assistantBubbles(page))).toHaveText(FULL_DEFAULT_ANSWER);
  await expect(userBubbles(page)).toHaveCount(1);
});

test("4. Regenerate posts the history without the old answer and shows one new answer", async ({
  page,
}) => {
  await page.goto(CHAT_PATH);
  await sendText(page, QUESTION);
  await waitForAnswers(page);
  const bubble = assistantBubbles(page);
  await expect(answerText(bubble)).toHaveText(FULL_DEFAULT_ANSWER);
  const oldAnswer = await answerText(bubble).innerText();

  const posted = page.waitForRequest(isChatPost);
  await regenerateButtons(page).click();
  // The old answer is gone at once; the new one streams in after the mock's first-token delay.
  await expect(bubble).toHaveCount(0);
  // Regenerate refocuses the composer on a fine pointer, same as sending.
  await expect(composer(page)).toBeFocused();
  // The body ends with the user message and carries no assistant turn or text.
  const body = (await posted).postDataJSON() as ChatRequestBody;
  expect(body.trigger).toBe("regenerate-message");
  expect(body.messages.map((message) => message.role)).toEqual(["user"]);
  expect(body.messages.at(-1)?.parts).toEqual([{ type: "text", text: QUESTION }]);
  expect(JSON.stringify(body)).not.toContain(oldAnswer.slice(0, 40));

  await waitForAnswers(page);
  await expect(answerText(bubble)).toHaveText(FULL_DEFAULT_ANSWER);
  await expect(userBubbles(page)).toHaveCount(1);
  await expect(regenerateButtons(page)).toHaveCount(1);
});

test("4. a second send posts the whole history: the question, its answer, then the new question", async ({
  page,
}) => {
  await page.goto(CHAT_PATH);
  await sendText(page, QUESTION);
  await waitForAnswers(page);

  const second = "And a second question";
  const body = await postedBody(page, () => sendText(page, second));
  expect(body.trigger).toBe("submit-message");
  expect(body.locale).toBe("en");
  expect(body.messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
  expect(body.messages[0].parts).toEqual([{ type: "text", text: QUESTION }]);
  expect(postedText(body.messages[1])).toMatch(FULL_DEFAULT_ANSWER);
  expect(body.messages[2].parts).toEqual([{ type: "text", text: second }]);

  await waitForAnswers(page, 2);
  await expect(userBubbles(page)).toHaveText([QUESTION, second]);
});

// History mode posts every earlier answer again. An answer can be longer than MAX_ASSISTANT_CHARS:
// the mock's [[slow]] answer (300 lines, ignoring the token cap), a [[slow]] answer stopped past
// the limit, or a real answer cut at the token cap above the limit's characters per token. The
// next message must still get an answer, not a 400 that Retry would post again.
test.describe("4. a follow-up after an answer longer than MAX_ASSISTANT_CHARS", () => {
  /** Sends a follow-up to the real route and expects the default answer as the second answer. */
  async function expectFollowUpAnswered(page: Page): Promise<void> {
    const followUp = "And a short follow-up";
    const body = await postedBody(page, () => sendText(page, followUp));
    // The input: the posted history carries the long answer whole.
    expect(body.messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(postedText(body.messages[1]).length).toBeGreaterThan(MAX_ASSISTANT_CHARS);

    await waitForAnswers(page, 2);
    await expect(banner(page)).toHaveCount(0);
    await expect(answerText(assistantBubbles(page).nth(1))).toHaveText(FULL_DEFAULT_ANSWER);
    await expect(userBubbles(page)).toHaveCount(2);
    await expect(userBubbles(page).nth(1)).toHaveText(followUp);
  }

  test("a completed [[slow]] answer", async ({ page }) => {
    await page.goto(CHAT_PATH);
    await sendText(page, SLOW_QUESTION);
    await waitForAnswers(page);
    await expectFollowUpAnswered(page);
  });

  test("a [[slow]] answer stopped past MAX_ASSISTANT_CHARS", async ({ page }) => {
    await page.goto(CHAT_PATH);
    await sendText(page, SLOW_QUESTION);
    const bubble = assistantBubbles(page);
    await expect
      .poll(() => textLength(bubble), { timeout: 15_000 })
      .toBeGreaterThan(MAX_ASSISTANT_CHARS);
    await stopButton(page).click();
    await expect(bubble.getByText("Stopped", { exact: true })).toBeVisible();
    await expectFollowUpAnswered(page);
  });

  test("an answer cut at the length limit past MAX_ASSISTANT_CHARS", async ({ page }) => {
    await page.goto(CHAT_PATH);
    const longAnswer = "A long answer that runs on. ".repeat(
      Math.ceil(MAX_ASSISTANT_CHARS / 28) + 10,
    );
    await page.route("**/api/chat", (route) =>
      fulfillSse(route, textAnswer(longAnswer.trim(), "length")),
    );
    await sendText(page, QUESTION);
    await waitForAnswers(page);
    await expect(
      assistantBubbles(page).getByText("Cut at demo length limit", { exact: true }),
    ).toBeVisible();
    await page.unroute("**/api/chat");
    await expectFollowUpAnswered(page);
  });
});

test.describe("5. autoscroll", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("follows the stream, stops on wheel up, resumes with Jump to latest", async ({ page }) => {
    await page.goto(CHAT_PATH);
    await sendText(page, SLOW_QUESTION);
    // Wait until the answer overflows the view by a good margin.
    await expect
      .poll(async () => (await scrollState(page)).overflow, { timeout: 10_000 })
      .toBeGreaterThan(400);

    // Following: within 2 px of the bottom while the content grows.
    const heightBefore = (await scrollState(page)).scrollHeight;
    for (let i = 0; i < 5; i++) {
      expect(await distanceFromBottom(page)).toBeLessThanOrEqual(2);
      await page.waitForTimeout(150);
    }
    expect((await scrollState(page)).scrollHeight).toBeGreaterThan(heightBefore);
    await expect(jumpButton(page)).toHaveCount(0);

    // An upward wheel mid-stream stops following: the view stays put while text arrives.
    const box = await scroller(page).boundingBox();
    if (box === null) throw new Error("The scroll container is not visible.");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -600);
    await expect(jumpButton(page)).toBeVisible();
    await waitForScrollToSettle(page);
    const settled = await scrollState(page);
    expect(await distanceFromBottom(page)).toBeGreaterThan(80);
    await page.waitForTimeout(500);
    const later = await scrollState(page);
    expect(Math.abs(later.scrollTop - settled.scrollTop)).toBeLessThanOrEqual(2);
    expect(later.scrollHeight).toBeGreaterThan(settled.scrollHeight);
    await expect(jumpButton(page)).toBeVisible();

    // Jump to latest returns to the bottom, and following resumes while the stream goes on.
    await jumpButton(page).click();
    await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(2);
    await expect(jumpButton(page)).toHaveCount(0);
    const heightAfterJump = (await scrollState(page)).scrollHeight;
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(150);
      expect(await distanceFromBottom(page)).toBeLessThanOrEqual(2);
    }
    expect((await scrollState(page)).scrollHeight).toBeGreaterThan(heightAfterJump);
    await expect(stopButton(page)).toBeVisible();
    await stopButton(page).click();
  });

  test("PageUp outside the composer stops following; inside it, it does not", async ({ page }) => {
    await page.goto(CHAT_PATH);
    await sendText(page, SLOW_QUESTION);
    await expect
      .poll(async () => (await scrollState(page)).overflow, { timeout: 10_000 })
      .toBeGreaterThan(400);
    expect(await distanceFromBottom(page)).toBeLessThanOrEqual(2);

    // In the composer, PageUp moves the caret: the view keeps following.
    await expect(composer(page)).toBeFocused();
    await page.keyboard.press("PageUp");
    // Give a buggy handler time to flip isFollowing and re-render before asserting absence.
    await page.waitForTimeout(300);
    await expect(jumpButton(page)).toHaveCount(0);
    expect(await distanceFromBottom(page)).toBeLessThanOrEqual(2);

    // Outside a text field it stops following: the view stays put while text arrives.
    await composer(page).blur();
    await page.keyboard.press("PageUp");
    await expect(jumpButton(page)).toBeVisible();
    await waitForScrollToSettle(page);
    const settled = await scrollState(page);
    await page.waitForTimeout(500);
    const later = await scrollState(page);
    expect(Math.abs(later.scrollTop - settled.scrollTop)).toBeLessThanOrEqual(2);
    expect(later.scrollHeight).toBeGreaterThan(settled.scrollHeight);
    await expect(jumpButton(page)).toBeVisible();
    await stopButton(page).click();
  });

  // While following, each pin moves the view down, and its scroll event reaches the hook only at
  // the next rendering step. A stop intent that lands in between must hold when that event
  // arrives. Here the stream is stopped, so no real pin moves the view: a script plays the pin
  // and the stop intent in one task, which fixes their order. Script-made events have no default
  // action, so nothing else scrolls.
  for (const intent of ["PageUp", "wheel up", "touch move down"] as const) {
    test(`a scroll event queued before a stop by ${intent} does not undo it`, async ({ page }) => {
      await page.goto(CHAT_PATH);
      await sendText(page, SLOW_QUESTION);
      await expect
        .poll(async () => (await scrollState(page)).overflow, { timeout: 10_000 })
        .toBeGreaterThan(400);
      await stopButton(page).click();
      await expect(statusRegion(page)).toHaveText("Response stopped");
      await waitForScrollToSettle(page);
      expect(await distanceFromBottom(page)).toBeLessThanOrEqual(2);

      // 30 px up: still near the bottom, so the view keeps following, and the last scroll
      // position the hook saw is 30 px above the bottom.
      await scroller(page).evaluate(async (element) => {
        element.scrollTop = element.scrollHeight - element.clientHeight - 30;
        // Scroll events fire in the rendering step, before its animation frame callbacks.
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      await page.waitForTimeout(300);
      await expect(jumpButton(page)).toHaveCount(0);

      await scroller(page).evaluate((element, intent) => {
        // The pin: a move down to the bottom, whose scroll event is now queued.
        element.scrollTop = element.scrollHeight;
        // The stop intent, before that event.
        if (intent === "PageUp") {
          document.body.dispatchEvent(
            new KeyboardEvent("keydown", { key: "PageUp", bubbles: true }),
          );
        } else if (intent === "wheel up") {
          element.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true }));
        } else {
          // The finger moving down scrolls the content up.
          const at = (clientY: number) => [new Touch({ identifier: 1, target: element, clientY })];
          element.dispatchEvent(new TouchEvent("touchstart", { touches: at(100), bubbles: true }));
          element.dispatchEvent(new TouchEvent("touchmove", { touches: at(140), bubbles: true }));
        }
      }, intent);
      await expect(jumpButton(page)).toBeVisible();
      // Give the queued scroll event time to arrive and a buggy handler time to re-render.
      await page.waitForTimeout(300);
      await expect(jumpButton(page)).toBeVisible();
    });
  }

  test("wheel up over a conversation that does not overflow never shows Jump to latest", async ({
    page,
  }) => {
    await page.goto(CHAT_PATH);
    await sendText(page, QUESTION);
    await waitForAnswers(page);
    expect((await scrollState(page)).overflow).toBeLessThanOrEqual(0);

    const box = await scroller(page).boundingBox();
    if (box === null) throw new Error("The scroll container is not visible.");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -300);
    // Give a buggy handler time to flip isFollowing and re-render before asserting
    // absence — otherwise a false pass could slip through before React re-renders.
    await page.waitForTimeout(300);

    await expect(jumpButton(page)).toHaveCount(0);
  });
});

test.describe("6. errors", () => {
  test("429 shows the translated limit text with no Retry; a later send succeeds", async ({
    page,
  }) => {
    await page.goto(CHAT_PATH);
    // The banner shows the client's errors.limit text, never the 429 body. In English that text
    // equals the server's, so the body here differs from it.
    const serverBody = "server limit text";
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 429,
        contentType: "text/plain; charset=utf-8",
        headers: { "Retry-After": "3600" },
        body: serverBody,
      }),
    );
    await sendText(page, QUESTION);
    await expect(banner(page)).toHaveText(LIMIT_TEXT_EN);
    await expect(banner(page)).not.toContainText(serverBody);
    await expect(banner(page)).toHaveAttribute("role", "alert");
    await expect(retryButton(page)).toHaveCount(0);

    await page.unroute("**/api/chat");
    await sendText(page, QUESTION);
    await waitForAnswers(page);
    await expect(banner(page)).toHaveCount(0);
    await expect(answerText(assistantBubbles(page))).toHaveText(FULL_DEFAULT_ANSWER);
  });

  test("a 500 HTML page shows the generic banner and never renders the HTML", async ({ page }) => {
    await page.goto(CHAT_PATH);
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 500,
        contentType: "text/html; charset=utf-8",
        body: "<!DOCTYPE html><html><body><h1>Upstream exploded</h1><p>Internal Server Error</p></body></html>",
      }),
    );
    await sendText(page, QUESTION);
    await expect(banner(page)).toContainText(GENERIC_ERROR_TEXT);
    await expect(retryButton(page)).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Upstream exploded");
    await expect(page.locator("body")).not.toContainText("<h1>");
    await expect(page.locator("h1", { hasText: "Upstream exploded" })).toHaveCount(0);
  });

  test("a network reset shows the generic banner; Retry succeeds with no duplicated user bubble", async ({
    page,
  }) => {
    await page.goto(CHAT_PATH);
    await page.route("**/api/chat", (route) => route.abort("connectionreset"));
    await sendText(page, QUESTION);
    await expect(banner(page)).toContainText(GENERIC_ERROR_TEXT);
    await expect(retryButton(page)).toBeVisible();

    await page.unroute("**/api/chat");
    await retryButton(page).click();
    await waitForAnswers(page);
    await expect(banner(page)).toHaveCount(0);
    await expect(userBubbles(page)).toHaveCount(1);
  });

  test("[[error]] keeps the partial text under the generic banner; Retry streams the full answer", async ({
    page,
  }) => {
    await page.goto(CHAT_PATH);
    // The server fails each [[error]] prompt text only once per process, so make it unique.
    await sendText(page, `${QUESTION} ${ERROR_TRIGGER} ${randomUUID()}`);
    await expect(banner(page)).toContainText(GENERIC_ERROR_TEXT);
    const bubble = assistantBubbles(page);
    await expect(answerText(bubble)).toHaveText("This answer fails");
    // Regenerate (under the partial answer) and the banner's Retry show at once.
    await expect(regenerateButtons(page)).toHaveCount(1);
    await expect(retryButton(page)).toHaveCount(1);
    await expect(statusRegion(page)).toHaveText("Response failed");

    await retryButton(page).click();
    await expect(answerText(bubble)).toHaveText(FULL_DEFAULT_ANSWER, { timeout: 20_000 });
    await waitUntilIdle(page);
    await expect(banner(page)).toHaveCount(0);
    await expect(bubble).toHaveCount(1);
    await expect(userBubbles(page)).toHaveCount(1);
  });
});

test.describe("7. input and New chat", () => {
  test("whitespace-only input keeps Send disabled", async ({ page }) => {
    await page.goto(CHAT_PATH);
    await composer(page).fill("   \n\t  ");
    await expect(sendButton(page)).toBeDisabled();
    await composer(page).press("Enter");
    await expect(userBubbles(page)).toHaveCount(0);
  });

  test(`input over ${MAX_USER_CHARS} characters is truncated`, async ({ page }) => {
    await page.goto(CHAT_PATH);
    await composer(page).fill("x".repeat(MAX_USER_CHARS + 100));
    expect((await composer(page).inputValue()).length).toBe(MAX_USER_CHARS);
  });

  test("pressing Enter twice within 50 ms sends exactly one request", async ({ page }) => {
    await page.goto(CHAT_PATH);
    let posts = 0;
    page.on("request", (request) => {
      if (isChatPost(request)) posts++;
    });
    await composer(page).fill(QUESTION);
    await expect(composer(page)).toBeFocused();
    // The page records when each Enter was pressed (the keydown's timeStamp).
    await page.evaluate(() => {
      const pressedAt: number[] = [];
      Object.assign(window, { enterPressedAt: pressedAt });
      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Enter") pressedAt.push(event.timeStamp);
        },
        { capture: true },
      );
    });
    // Two trusted Enter presses sent as one burst, so the gap between them does not
    // depend on test-runner latency: two sequential keyboard.press() calls took up to
    // 30 ms under load. The browser still handles each keydown as its own task.
    const cdp = await page.context().newCDPSession(page);
    const enter = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 };
    const enterDown = { type: "keyDown", text: "\r", unmodifiedText: "\r", ...enter } as const;
    const enterUp = { type: "keyUp", ...enter } as const;
    await Promise.all([
      cdp.send("Input.dispatchKeyEvent", enterDown),
      cdp.send("Input.dispatchKeyEvent", enterUp),
      cdp.send("Input.dispatchKeyEvent", enterDown),
      cdp.send("Input.dispatchKeyEvent", enterUp),
    ]);
    const pressedAt = await page.evaluate(
      () => (window as unknown as { enterPressedAt: number[] }).enterPressedAt,
    );
    expect(pressedAt).toHaveLength(2);
    const gapMs = pressedAt[1] - pressedAt[0];
    annotate("double-enter-gap-ms", gapMs);
    expect(gapMs).toBeLessThan(50);

    await expect(stopButton(page)).toBeVisible();
    // Regenerate is hidden while busy.
    await expect(regenerateButtons(page)).toHaveCount(0);
    await waitForAnswers(page);
    expect(posts, "POST /api/chat requests").toBe(1);
    await expect(userBubbles(page)).toHaveCount(1);
  });

  // An IME (Chinese, Japanese or Korean input) confirms a word with Enter (template spec §5.8).
  // The keys are dispatched as a browser reports them, since Playwright types no composition.
  test("Enter inside an IME composition does not send", async ({ page }) => {
    await page.goto(CHAT_PATH);
    let posts = 0;
    page.on("request", (request) => {
      if (isChatPost(request)) posts++;
    });
    await composer(page).fill(QUESTION);
    const enter = (keyCode: number, isComposing = false) =>
      composer(page).evaluate(
        (element, init) =>
          element.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true, ...init }),
          ),
        { keyCode, isComposing },
      );

    // The browser's own flag.
    await enter(229, true);
    await expect(composer(page)).toHaveValue(QUESTION);
    // Inside a composition the page saw start, with no flag on the key.
    await composer(page).evaluate((element) =>
      element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })),
    );
    await enter(13);
    await expect(composer(page)).toHaveValue(QUESTION);
    await expect(userBubbles(page)).toHaveCount(0);

    // The control: once the composition is over, Enter sends, once.
    await composer(page).evaluate((element) =>
      element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })),
    );
    await enter(13);
    await waitForAnswers(page);
    await expect(userBubbles(page)).toHaveText([QUESTION]);
    expect(posts, "POST /api/chat requests").toBe(1);
  });

  test("Safari's Enter that ends an IME composition, after compositionend, does not send", async ({
    page,
  }) => {
    await page.goto(CHAT_PATH);
    await composer(page).fill(QUESTION);
    // Safari's order: compositionend, then the Enter's keydown with keyCode 229.
    await composer(page).evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
      element.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true }),
      );
    });
    await expect(composer(page)).toHaveValue(QUESTION);
    await expect(userBubbles(page)).toHaveCount(0);

    // The control: the next Enter sends.
    await composer(page).press("Enter");
    await waitForAnswers(page);
    await expect(userBubbles(page)).toHaveText([QUESTION]);
  });

  test("New chat clears the conversation and shows the empty state", async ({ page }) => {
    await page.goto(CHAT_PATH);
    await sendText(page, QUESTION);
    await waitForAnswers(page);

    await newChatButton(page, "New chat").click();
    await expect(userBubbles(page)).toHaveCount(0);
    await expect(assistantBubbles(page)).toHaveCount(0);
    await expect(conversation(page)).toHaveCount(0);
    await expect(
      page.getByRole("heading", { level: 2, name: EMPTY_EN.title, exact: true }),
    ).toBeVisible();
    for (const prompt of PROMPTS_EN) {
      await expect(promptButton(page, prompt)).toBeVisible();
    }
    // New chat refocuses the composer on a fine pointer, same as sending.
    await expect(composer(page)).toBeFocused();
  });

  test("a double-click on Send sends once, and its second click does not stop the answer", async ({
    page,
  }) => {
    await page.goto(CHAT_PATH);
    let posts = 0;
    page.on("request", (request) => {
      if (isChatPost(request)) posts++;
    });
    await composer(page).fill(QUESTION);
    // The first click sends and turns the button into Stop; the second (detail 2) lands on Stop.
    await sendButton(page).dblclick();
    await expect(stopButton(page)).toBeVisible();
    await expect(stoppedRow(page)).toHaveCount(0);
    await waitForAnswers(page);
    const bubble = assistantBubbles(page);
    await expect(answerText(bubble)).toHaveText(FULL_DEFAULT_ANSWER);
    await expect(bubble.getByText("Stopped", { exact: true })).toHaveCount(0);
    await expect(statusRegion(page)).toHaveText("Response complete");
    expect(posts, "POST /api/chat requests").toBe(1);

    // The control: one click on Stop (detail 1) still stops.
    await sendText(page, SLOW_QUESTION);
    await expect(bubble).toHaveCount(2);
    await stopButton(page).click();
    await expect(bubble.nth(1).getByText("Stopped", { exact: true })).toBeVisible();
    expect(posts, "POST /api/chat requests").toBe(2);
  });

  // A browser counts clicks at one spot into one chain for as long as the system's double-click
  // time, which a visitor may set to seconds. Only a click soon after the send is taken for the
  // rest of a double-click on Send (template spec §5.8).
  test(`a click on Stop past ${SEND_DOUBLE_CLICK_MS} ms after the send stops, even as the second click of a chain`, async ({
    page,
  }) => {
    await page.goto(CHAT_PATH);
    await composer(page).fill(SLOW_QUESTION);
    const box = await sendButton(page).boundingBox();
    if (box === null) throw new Error("The Send button is not visible.");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    // The first click sends, and the button turns into Stop under the pointer.
    await page.mouse.down({ clickCount: 1 });
    await page.mouse.up({ clickCount: 1 });
    await expect(stopButton(page)).toBeVisible();
    const bubble = assistantBubbles(page);
    await expect(bubble).toHaveCount(1);
    await page.waitForTimeout(SEND_DOUBLE_CLICK_MS + 200);

    // The second click of the same chain (detail 2), well after the send.
    await page.mouse.down({ clickCount: 2 });
    await page.mouse.up({ clickCount: 2 });
    await expect(bubble.getByText("Stopped", { exact: true })).toBeVisible();
    await expect(statusRegion(page)).toHaveText("Response stopped");
  });
});

test.describe("8. failure modes", () => {
  test("timeout before the first token (abort chunk, no finish): generic banner with Retry, no Stopped row; Retry recovers", async ({
    page,
  }) => {
    await page.goto(CHAT_PATH);
    // What the real route sends when streamText's firstChunkMs timeout fires: an `abort` chunk
    // with no preceding text and no `finish`.
    await page.route("**/api/chat", (route) =>
      fulfillSse(
        route,
        sse([
          { type: "start" },
          {
            type: "abort",
            reason: `TimeoutError: First chunk timeout of ${FIRST_CHUNK_TIMEOUT_MS}ms exceeded`,
          },
        ]),
      ),
    );
    await sendText(page, QUESTION);
    await expect(banner(page)).toContainText(GENERIC_ERROR_TEXT);
    await expect(retryButton(page)).toBeVisible();
    await expect(stoppedRow(page)).toHaveCount(0);
    await expect(assistantBubbles(page)).toHaveCount(0);
    await expect(statusRegion(page)).toHaveText("Response failed");

    await page.unroute("**/api/chat");
    await retryButton(page).click();
    await waitForAnswers(page);
    await expect(banner(page)).toHaveCount(0);
    await expect(answerText(assistantBubbles(page))).toHaveText(FULL_DEFAULT_ANSWER);
    await expect(userBubbles(page)).toHaveCount(1);
  });

  test("finishReason length shows 'Cut at demo length limit'", async ({ page }) => {
    await page.goto(CHAT_PATH);
    await page.route("**/api/chat", (route) =>
      fulfillSse(route, textAnswer("A long answer that the demo cuts short.", "length")),
    );
    await sendText(page, QUESTION);
    await waitForAnswers(page);
    const bubble = assistantBubbles(page);
    await expect(bubble.getByText("Cut at demo length limit", { exact: true })).toBeVisible();
    await expect(regenerateButtons(page)).toHaveCount(1);
    await expect(banner(page)).toHaveCount(0);
  });

  test("New chat while streaming aborts the request, shows the empty state and no late bubble appears", async ({
    page,
  }) => {
    await page.goto(CHAT_PATH);
    let abortedRequests = 0;
    page.on("requestfailed", (request) => {
      if (isChatPost(request)) abortedRequests++;
    });

    await sendText(page, SLOW_QUESTION);
    await expect(assistantBubbles(page)).toHaveCount(1);

    await newChatButton(page, "New chat").click();
    await expect(conversation(page)).toHaveCount(0);
    await expect(userBubbles(page)).toHaveCount(0);
    await expect(assistantBubbles(page)).toHaveCount(0);
    await expect(banner(page)).toHaveCount(0);
    await expect(sendButton(page)).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: EMPTY_EN.title, exact: true }),
    ).toBeVisible();

    // Past the mock's 600 ms first-token delay: the aborted stream never reaches the page.
    await page.waitForTimeout(1000);
    await expect(userBubbles(page)).toHaveCount(0);
    await expect(assistantBubbles(page)).toHaveCount(0);
    expect(abortedRequests).toBe(1);

    await promptButton(page, PROMPTS_EN[1]).click();
    await expect(assistantBubbles(page)).toHaveCount(1);
    await stopButton(page).click();
  });

  test("New chat clears an error banner", async ({ page }) => {
    await page.goto(CHAT_PATH);
    await page.route("**/api/chat", (route) => route.abort("connectionreset"));
    await sendText(page, QUESTION);
    await expect(banner(page)).toContainText(GENERIC_ERROR_TEXT);

    await newChatButton(page, "New chat").click();
    await expect(banner(page)).toHaveCount(0);
    await expect(userBubbles(page)).toHaveCount(0);
    await expect(conversation(page)).toHaveCount(0);
    await expect(promptButton(page, PROMPTS_EN[0])).toBeVisible();
  });

  /**
   * Sends one-word answers until the conversation holds MAX_MESSAGES messages, and returns the
   * messages.length of each posted body.
   */
  async function fillToTheCap(page: Page): Promise<number[]> {
    const postedSizes: number[] = [];
    await page.route("**/api/chat", async (route) => {
      const body = route.request().postDataJSON() as ChatRequestBody;
      postedSizes.push(body.messages.length);
      await fulfillSse(route, textAnswer("ok"));
    });
    for (let i = 0; i < Math.ceil(MAX_MESSAGES / 2); i++) {
      await sendText(page, `message ${i + 1}`);
      await waitForAnswers(page, i + 1);
    }
    await expect(composer(page)).toBeDisabled();
    return postedSizes;
  }

  // One MAX_MESSAGES for the client cap and the route's 400 (X-01 design §4.3, §9).
  test(`${MAX_MESSAGES} messages disable the composer under the cap text; New chat re-enables it`, async ({
    page,
  }) => {
    await page.goto(CHAT_PATH);
    const postedSizes = await fillToTheCap(page);
    // Each request carries the whole history, and none carries more than the cap.
    const roundTrips = Math.ceil(MAX_MESSAGES / 2);
    expect(postedSizes).toEqual(Array.from({ length: roundTrips }, (_, i) => 2 * i + 1));
    expect(Math.max(...postedSizes), "largest posted messages.length").toBeLessThanOrEqual(
      MAX_MESSAGES,
    );

    await expect(composer(page)).toBeDisabled();
    // The cap text is on screen, not a placeholder a draft would hide, and describes the composer.
    await expect(page.getByText(CAP_TEXT, { exact: true })).toBeVisible();
    await expect(composer(page)).toHaveAccessibleDescription(CAP_TEXT);
    await expect(sendButton(page)).toBeDisabled();
    // Regenerate still works at the cap: it replaces the last answer, not a new turn.
    await expect(regenerateButtons(page)).toHaveCount(1);

    await newChatButton(page, "New chat").click();
    await expect(composer(page)).toBeEnabled();
    await expect(page.getByText(CAP_TEXT, { exact: true })).toHaveCount(0);
    await expect(composer(page)).toHaveAttribute("placeholder", PLACEHOLDER);
    // Focused on a fine pointer, as after Send, Stop and Regenerate, though it was disabled until
    // New chat: the next message needs no click.
    await expect(composer(page)).toBeFocused();
    await page.keyboard.type("next");
    await expect(composer(page)).toHaveValue("next");
  });

  test("a draft typed while the answer that reaches the cap streams keeps the focus, under the cap text", async ({
    page,
  }) => {
    await page.goto(CHAT_PATH);
    const roundTrips = Math.ceil(MAX_MESSAGES / 2);
    // The answer that reaches the cap waits until the visitor has typed a draft.
    let draftTyped = () => {};
    const typed = new Promise<void>((resolve) => {
      draftTyped = resolve;
    });
    let posts = 0;
    await page.route("**/api/chat", async (route) => {
      posts++;
      if (posts === roundTrips) await typed;
      await fulfillSse(route, textAnswer("ok"));
    });
    for (let i = 1; i < roundTrips; i++) {
      await sendText(page, `message ${i}`);
      await waitForAnswers(page, i);
    }
    await sendText(page, `message ${roundTrips}`);
    await expect(stopButton(page)).toBeVisible();
    await expect(composer(page)).toBeFocused();
    await page.keyboard.type("a draft");
    draftTyped();
    await waitForAnswers(page, roundTrips);

    // At the cap the composer takes no more text, but keeps the focus and the draft, and the cap
    // text shows above it and describes it.
    await expect(composer(page)).toBeDisabled();
    await expect(composer(page)).toBeFocused();
    await expect(composer(page)).toHaveValue("a draft");
    await expect(page.getByText(CAP_TEXT, { exact: true })).toBeVisible();
    await expect(composer(page)).toHaveAccessibleDescription(CAP_TEXT);
    await page.keyboard.type(" more");
    await page.keyboard.press("Enter");
    await expect(composer(page)).toHaveValue("a draft");
    await expect(userBubbles(page)).toHaveCount(roundTrips);
    expect(posts, "POST /api/chat requests").toBe(roundTrips);

    // New chat lifts the cap and keeps the draft, ready to send.
    await newChatButton(page, "New chat").click();
    await expect(composer(page)).toBeEnabled();
    await expect(page.getByText(CAP_TEXT, { exact: true })).toHaveCount(0);
    await expect(composer(page)).toHaveValue("a draft");
    await expect(composer(page)).toBeFocused();
  });

  test("at the cap, New chat from the keyboard puts the focus in the composer", async ({
    page,
  }) => {
    await page.goto(CHAT_PATH);
    await fillToTheCap(page);

    // Keyboard only: back through the page to New chat, then Enter.
    const newChat = newChatButton(page, "New chat");
    const trail: string[] = [];
    for (let i = 0; i < 12; i++) {
      if (await newChat.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press("Shift+Tab");
      trail.push(
        await page.evaluate(
          () =>
            document.activeElement?.getAttribute("aria-label") ??
            document.activeElement?.textContent ??
            "",
        ),
      );
    }
    await expect(newChat, `focus went through: ${trail.join(" | ")}`).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(composer(page)).toBeEnabled();
    await expect(composer(page)).toBeFocused();
    await page.keyboard.type("next");
    await expect(composer(page)).toHaveValue("next");
  });

  test.describe("touch device", () => {
    test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

    test("touch: no autofocus, no refocus after Stop, 44 px targets, no horizontal scroll", async ({
      page,
    }) => {
      await page.goto(CHAT_PATH);
      const isCoarsePointer = await page.evaluate(
        () => window.matchMedia("(pointer: coarse)").matches,
      );
      expect(isCoarsePointer).toBe(true);
      await expect(composer(page)).not.toBeFocused();

      for (const name of [...PROMPTS_EN, "New chat"]) {
        const box = await page.getByRole("button", { name, exact: true }).boundingBox();
        expect(box?.height, `height of "${name}"`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      }

      // One column below sm: the second suggested prompt sits directly under the first.
      const first = (await promptButton(page, PROMPTS_EN[0]).boundingBox())!;
      const second = (await promptButton(page, PROMPTS_EN[1]).boundingBox())!;
      expect(second.y).toBeGreaterThan(first.y);
      expect(second.x).toBe(first.x);

      await composer(page).tap();
      await composer(page).fill(SLOW_QUESTION);
      await composer(page).blur();
      const sendBox = (await sendButton(page).boundingBox())!;
      expect(sendBox.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);

      await sendButton(page).tap();
      await expect(assistantBubbles(page)).toHaveCount(1);
      const stopBox = (await stopButton(page).boundingBox())!;
      expect(stopBox.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);

      await stopButton(page).tap();
      await expect(assistantBubbles(page).getByText("Stopped", { exact: true })).toBeVisible();
      await expect(composer(page)).not.toBeFocused();

      const regenBox = (await regenerateButtons(page).boundingBox())!;
      expect(regenBox.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);

      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(widths.scroll).toBeLessThanOrEqual(widths.client);
    });

    // The hook observes the scroll container as well as the content: after the stream no text
    // changes, so only that observer re-pins a view that gets shorter with the same width (an
    // on-screen keyboard that resizes the layout, a shorter window). The order matters: after a
    // stream that ended in portrait, Chromium leaves that view 362 px short of the bottom without
    // the observer, while a width change reflows the content, which the content observer sees.
    test("touch: a rotation or a smaller view keeps a followed answer at the bottom", async ({
      page,
    }) => {
      await page.goto(CHAT_PATH);
      await composer(page).tap();
      await composer(page).fill(SLOW_QUESTION);
      await sendButton(page).tap();
      await expect
        .poll(async () => (await scrollState(page)).overflow, { timeout: 10_000 })
        .toBeGreaterThan(400);

      async function resizeAndExpectPinned(size: { width: number; height: number }) {
        await page.setViewportSize(size);
        const label = `${size.width} × ${size.height}`;
        await expect
          .poll(() => distanceFromBottom(page), { message: `distance from bottom at ${label}` })
          .toBeLessThanOrEqual(2);
        // Give a buggy handler time to stop following and re-render before asserting absence.
        await page.waitForTimeout(300);
        await expect(jumpButton(page)).toHaveCount(0);
        expect(await distanceFromBottom(page), `still pinned at ${label}`).toBeLessThanOrEqual(2);
        const widths = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }));
        expect(widths.scroll, `horizontal scroll at ${label}`).toBeLessThanOrEqual(widths.client);
      }

      // Mid-stream, the phone turns to landscape and back.
      await resizeAndExpectPinned({ width: 812, height: 375 });
      await resizeAndExpectPinned({ width: 375, height: 812 });
      await expect(stopButton(page)).toBeVisible();

      await waitForAnswers(page);
      // After the stream: an on-screen keyboard that resizes the layout, then landscape.
      await resizeAndExpectPinned({ width: 375, height: 450 });
      await resizeAndExpectPinned({ width: 812, height: 375 });
    });

    // A rotation that makes the question above take fewer lines: Chromium's scroll anchoring
    // moves the view up by the lines saved, and if a script reads the layout before the next
    // frame, that scroll event reaches the hook before the resize observer pins the view, so
    // following stops (a CI run on Linux, whose fonts wrap the default question on a phone). The
    // hook turns anchoring off while following (X-01 design §4.2), so the view never moves up.
    // The resize is sent through CDP together with the read, so the read lands before the frame.
    // That read catches the bug only on some runs, so the test also checks the cause, which needs
    // no timing: on a followed view that overflows, the scroll container's computed
    // overflow-anchor is "none".
    test("touch: a rotation never moves a followed view up", async ({ page }) => {
      await page.goto(CHAT_PATH);
      await composer(page).tap();
      await composer(page).fill(
        `Explain, in one short paragraph, what streaming means for a chat interface. ${SLOW_TRIGGER}`,
      );
      await sendButton(page).tap();
      await expect(sendButton(page)).toBeVisible({ timeout: 20_000 });
      await expect.poll(async () => (await scrollState(page)).overflow).toBeGreaterThan(400);
      await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(2);
      const before = (await scrollState(page)).scrollTop;
      expect(
        await scroller(page).evaluate((el) => getComputedStyle(el).overflowAnchor),
        "scroll anchoring is off while following",
      ).toBe("none");

      await scroller(page).evaluate((element) => {
        (window as unknown as { scroller: Element }).scroller = element;
      });
      const cdp = await page.context().newCDPSession(page);
      const scale = await page.evaluate(() => window.devicePixelRatio);
      const [, read] = await Promise.all([
        cdp.send("Emulation.setDeviceMetricsOverride", {
          width: 812,
          height: 375,
          deviceScaleFactor: scale,
          mobile: true,
        }),
        cdp.send("Runtime.evaluate", {
          expression: "(window.scroller).scrollTop",
          returnByValue: true,
        }),
      ]);
      expect(
        read.result.value,
        "scrollTop at the first layout after rotating",
      ).toBeGreaterThanOrEqual(before);
      await expect
        .poll(() => distanceFromBottom(page), { message: "distance from bottom after rotating" })
        .toBeLessThanOrEqual(2);
      await expect(jumpButton(page)).toHaveCount(0);
    });

    test("touch: Jump to latest, Retry and the footer links are 44 px tall", async ({ page }) => {
      await page.goto(CHAT_PATH);
      for (const name of ["Felipe Rêgo", "Source on GitHub"]) {
        const box = await page.getByRole("link", { name, exact: true }).boundingBox();
        expect(box?.height, `height of "${name}"`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      }

      // Jump to latest, once an answer overflows the view and the view leaves the bottom.
      await composer(page).tap();
      await composer(page).fill(SLOW_QUESTION);
      await sendButton(page).tap();
      await expect
        .poll(async () => (await scrollState(page)).overflow, { timeout: 10_000 })
        .toBeGreaterThan(400);
      const box = await scroller(page).boundingBox();
      if (box === null) throw new Error("The scroll container is not visible.");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -600);
      await expect(jumpButton(page)).toBeVisible();
      const jumpBox = await jumpButton(page).boundingBox();
      // Null if following resumed after toBeVisible: say so, not a TypeError on `height`.
      expect(jumpBox, "Jump to latest is still shown").not.toBeNull();
      expect(jumpBox!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      await stopButton(page).tap();

      // Retry, under the generic banner.
      await page.route("**/api/chat", (route) => route.abort("connectionreset"));
      await composer(page).fill(QUESTION);
      await sendButton(page).tap();
      await expect(banner(page)).toContainText(GENERIC_ERROR_TEXT);
      const retryBox = (await retryButton(page).boundingBox())!;
      expect(retryBox.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);

      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(widths.scroll).toBeLessThanOrEqual(widths.client);
    });
  });
});

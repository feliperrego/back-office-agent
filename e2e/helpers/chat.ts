import { expect, test, type Locator, type Page, type Request, type Route } from "@playwright/test";

// Locators and waits for the chat e2e (X-01 design §6), shared by chat.spec.ts and
// chat-i18n.spec.ts. English names, except where a function takes the name to look for.

/** One message of a POST /api/chat body. */
export type PostedMessage = { id: string; role: string; parts: { type: string; text?: string }[] };

/**
 * The body useChat's default transport posts: the chat id, the whole history, the trigger and,
 * from the chat, the interface language (X-01 design §4.3).
 */
export type ChatRequestBody = {
  id: string;
  messages: PostedMessage[];
  trigger: string;
  messageId?: string;
  locale?: unknown;
};

export const composer = (page: Page) => page.getByRole("textbox");
export const sendButton = (page: Page) => page.getByRole("button", { name: "Send message" });
export const stopButton = (page: Page) => page.getByRole("button", { name: "Stop generating" });
export const retryButton = (page: Page) => page.getByRole("button", { name: "Retry" });
export const regenerateButtons = (page: Page) => page.getByRole("button", { name: "Regenerate" });
export const jumpButton = (page: Page) => page.getByRole("button", { name: "Jump to latest" });
// On the whole page, as every locator here: wherever the chat puts New chat, in the site header
// (the default) or in a bar of the project's own (Chat's header prop, template spec §5.8).
export const newChatButton = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
export const promptButton = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
export const conversation = (page: Page) => page.getByRole("log");
// The scroll container is the parent of the role="log" list.
export const scroller = (page: Page) => conversation(page).locator("xpath=..");
export const userBubbles = (page: Page) => page.locator('[data-message-role="user"]');
export const assistantBubbles = (page: Page) => page.locator('[data-message-role="assistant"]');
// The error banner. The shadcn Alert carries role="alert"; Next.js's route announcer also has
// role="alert", so the banner is located by its data-slot.
export const banner = (page: Page) => page.locator('[data-slot="alert"]');
export const stoppedRow = (page: Page) => page.getByTestId("stopped-row");
export const typingDots = (page: Page) => page.getByTestId("typing-indicator");
// The sr-only live region the chat announces "Response failed/stopped/complete" through.
export const statusRegion = (page: Page) => page.locator('div[role="status"].sr-only');
// The answer text is the first child of an assistant bubble; the caption row goes last
// (the renderer contract, X-01 design §4.3).
export const answerText = (bubble: Locator) => bubble.locator(":scope > div").first();

export function isChatPost(request: Request): boolean {
  return request.method() === "POST" && new URL(request.url()).pathname === "/api/chat";
}

/** Runs `action` and returns the body of the POST /api/chat it sends. */
export async function postedBody(
  page: Page,
  action: () => Promise<void>,
): Promise<ChatRequestBody> {
  const posted = page.waitForRequest(isChatPost);
  await action();
  return (await posted).postDataJSON() as ChatRequestBody;
}

/** One SSE frame per chunk, exactly as createUIMessageStreamResponse writes it, then [DONE]. */
export function sse(chunks: object[]): string {
  return chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
}

/** Fulfills a route with a UI-message-stream SSE body, with the headers the real route sends. */
export async function fulfillSse(route: Route, body: string): Promise<void> {
  await route.fulfill({
    status: 200,
    headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
    body,
  });
}

/** A one-shot SSE answer: start, one text part, then finish (default finishReason "stop"). */
export function textAnswer(text: string, finishReason = "stop"): string {
  return sse([
    { type: "start" },
    { type: "start-step" },
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: text },
    { type: "text-end", id: "t" },
    { type: "finish-step" },
    { type: "finish", finishReason },
  ]);
}

export async function sendText(page: Page, text: string): Promise<void> {
  await composer(page).fill(text);
  await sendButton(page).click();
}

/** Waits until the request is over: the Stop button has turned back into Send. */
export async function waitUntilIdle(page: Page): Promise<void> {
  await expect(sendButton(page)).toBeVisible({ timeout: 20_000 });
}

/** Waits until the page shows `count` answers and the last request is over. */
export async function waitForAnswers(page: Page, count = 1): Promise<void> {
  await expect(assistantBubbles(page)).toHaveCount(count, { timeout: 20_000 });
  await waitUntilIdle(page);
}

export async function textLength(bubble: Locator): Promise<number> {
  return answerText(bubble).evaluate((element) => element.textContent?.length ?? 0);
}

/** Records a measured value in the test report, to diagnose a flake. */
export function annotate(type: string, value: number): void {
  test.info().annotations.push({ type, description: String(value) });
}

export type ScrollState = {
  scrollTop: number;
  scrollHeight: number;
  /** How far the content extends past the view. */
  overflow: number;
  /** Distance between the bottom of the view and the bottom of the content. */
  fromBottom: number;
};

export async function scrollState(page: Page): Promise<ScrollState> {
  return scroller(page).evaluate((element) => ({
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    overflow: element.scrollHeight - element.clientHeight,
    fromBottom: element.scrollHeight - element.scrollTop - element.clientHeight,
  }));
}

export async function distanceFromBottom(page: Page): Promise<number> {
  return (await scrollState(page)).fromBottom;
}

/** Waits until a scroll has settled: two equal scrollTop readings 50 ms apart. */
export async function waitForScrollToSettle(page: Page): Promise<void> {
  let lastTop = Number.NaN;
  await expect
    .poll(
      async () => {
        const { scrollTop } = await scrollState(page);
        const settled = scrollTop === lastTop;
        lastTop = scrollTop;
        return settled;
      },
      { intervals: [50] },
    )
    .toBe(true);
}

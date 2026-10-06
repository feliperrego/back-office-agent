import { expect, test } from "@playwright/test";

test("page shows the mock model and the footer", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header[data-model]");
  await expect(header).toHaveAttribute("data-model", "mock");
  await expect(header).toHaveAttribute("data-mock", "");
  // What a measurement records as the deployed commit (template spec §5.6, §7.5): the build's
  // VERCEL_GIT_COMMIT_SHA on Vercel, "local" for a build made elsewhere, as this one is.
  await expect(header).toHaveAttribute("data-commit", /^(?:local|[0-9a-f]{40})$/);
  // Scoped to the header: a page that also shows recorded mock answers names the mock there too.
  await expect(header.getByText("Mock model", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Felipe Rêgo" })).toHaveAttribute(
    "href",
    "https://feliperrego.com",
  );
});

test("health route reports mock mode with the limiter off", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true, model: "mock", mock: true, rateLimit: "off" });
});

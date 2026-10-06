import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

// Measurement against the deployed demo (template spec §7.5):
//   MEASURE_URL=<deployed URL> MEASURE_LOCATION='<city, connection>' \
//     pnpm exec playwright test --project=measure
// The measure project exists only when MEASURE_URL is set, so CI never runs *.measure.ts.
const MEASURE_URL = process.env.MEASURE_URL;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries, so a flaky test fails instead of passing on its second try. A project that
  // needs one scopes it to that describe (template spec §7.2).
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL,
    // With no retries, "on-first-retry" would record nothing.
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    ...(MEASURE_URL
      ? [
          {
            name: "measure",
            testMatch: /\.measure\.ts$/,
            // Every request counts against the hourly rate limit, so a retry would spend
            // part of the next run's quota.
            retries: 0,
            workers: 1,
            use: { ...devices["Desktop Chrome"], baseURL: MEASURE_URL },
          },
        ]
      : []),
  ],
  // A measurement runs against a deployed URL, never a local server.
  webServer: MEASURE_URL
    ? undefined
    : {
        // CI already ran `pnpm build` with AI_MOCK=1; locally, build first.
        // Both paths serve a production build, never `next dev` (template spec §7.2).
        command: process.env.CI ? "pnpm start" : "pnpm build && pnpm start",
        url: `${baseURL}/api/health`,
        // Merged over process.env. Empty Upstash vars force the limiter off even
        // when a local .env* file holds real ones.
        env: {
          PORT: String(PORT),
          AI_MOCK: "1",
          // The chat e2e texts that show the hourly limit (the rate note, the 429 text) assume the
          // default limit; pinned so a local .env* value cannot change the page the local run
          // builds. (In CI the build step runs separately with the workflow env, which sets no
          // limit.)
          RATE_LIMIT_PER_HOUR: "20",
          UPSTASH_REDIS_REST_URL: "",
          UPSTASH_REDIS_REST_TOKEN: "",
          KV_REST_API_URL: "",
          KV_REST_API_TOKEN: "",
        },
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
      },
});

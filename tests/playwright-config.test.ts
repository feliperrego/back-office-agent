import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadConfig(env: Record<string, string | undefined> = {}) {
  for (const name of ["CI", "MEASURE_URL"]) vi.stubEnv(name, "");
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return (await import("@/playwright.config")).default;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("playwright.config.ts", () => {
  it("never retries, even in CI, and keeps the trace of every failure", async () => {
    for (const ci of ["", "1"]) {
      vi.resetModules();
      const config = await loadConfig({ CI: ci });
      expect(config.retries).toBe(0);
      expect(config.use?.trace).toBe("retain-on-failure");
    }
  });

  it("has only the chromium project and a local mock server without MEASURE_URL", async () => {
    const config = await loadConfig();
    expect(config.projects?.map((project) => project.name)).toEqual(["chromium"]);
    expect(config.webServer).toMatchObject({
      env: { AI_MOCK: "1", PORT: "3100", RATE_LIMIT_PER_HOUR: "20" },
    });
  });

  it("adds a measure project on MEASURE_URL: no retries, one worker, no local server", async () => {
    const config = await loadConfig({ MEASURE_URL: "https://demo.example.com" });
    const measure = config.projects?.find((project) => project.name === "measure");

    expect(measure).toMatchObject({
      retries: 0,
      workers: 1,
      use: { baseURL: "https://demo.example.com" },
    });
    const testMatch = measure?.testMatch as RegExp;
    expect(testMatch.test("e2e/ttft.measure.ts")).toBe(true);
    expect(testMatch.test("e2e/smoke.spec.ts")).toBe(false);
    expect(config.webServer).toBeUndefined();
  });
});

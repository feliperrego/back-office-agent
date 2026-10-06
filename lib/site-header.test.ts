import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The header's server-only values (template spec §5.6, §5.12): the model, the mock flag and the
// commit, written once for every page that renders the site header. lib/ai/model.ts reads the
// environment when it loads, so each test sets it and imports a fresh copy.
async function load(env: Record<string, string | undefined>) {
  vi.stubEnv("AI_MOCK", undefined);
  vi.stubEnv("AI_MODEL", undefined);
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined);
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return import("./site-header");
}

const SHA = "0123456789abcdef0123456789abcdef01234567";

describe("siteHeaderProps", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("passes a real model's label on", async () => {
    const { siteHeaderProps } = await load({ AI_MODEL: "provider/model-a" });
    expect(siteHeaderProps()).toEqual({
      modelLabel: "provider/model-a",
      isMock: false,
      commit: "local",
    });
  });

  it("says mock mode, as the header's badge and data-mock need", async () => {
    const { siteHeaderProps } = await load({ AI_MOCK: "1" });
    expect(siteHeaderProps()).toEqual({ modelLabel: "mock", isMock: true, commit: "local" });
  });

  it("gives the build's commit, or local for a build made off Vercel", async () => {
    const { siteHeaderProps } = await load({ AI_MOCK: "1", VERCEL_GIT_COMMIT_SHA: SHA });
    expect(siteHeaderProps().commit).toBe(SHA);
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined);
    expect(siteHeaderProps().commit).toBe("local");
  });

  // What a measurement records as the deployed commit must never be empty (template spec §7.5).
  it("treats an empty commit variable as unset, so data-commit is never empty", async () => {
    const { siteHeaderProps } = await load({ AI_MOCK: "1", VERCEL_GIT_COMMIT_SHA: "" });
    expect(siteHeaderProps().commit).toBe("local");
  });
});

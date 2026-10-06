import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { release } from "node:os";
import path from "node:path";
import { expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { assertSafeToWrite, measurementPath } from "@/lib/measure/record";

/**
 * Guards and file writing shared by every e2e/<metric>.measure.ts (template spec §7.5). The
 * metric's own requests, statistics and README lines stay in the project.
 */

type Env = Record<string, string | undefined>;

/** What is deployed, read from the page header (template spec §5.6), never from a flag. */
export type Deployment = { model: string; commit: string };

/** Where and against what the run happened. Projects spread it into their JSON record. */
export type MeasurementMeta = {
  /** Start of the run, ISO 8601 in UTC. It names the file. */
  date: string;
  url: string;
  model: string;
  /** MEASURE_LOCATION, e.g. "Recife, home fibre". */
  location: string;
  userAgent: string;
  /** `browser.version()` of the browser that ran the measurement. */
  browserVersion: string;
  /** `process.platform` and `os.release()`, e.g. "darwin 23.4.0". */
  platform: string;
  commit: string;
};

/** MEASURE_LOCATION, trimmed. Required: a number is published with where it was measured. */
export function measureLocation(env: Env = process.env): string {
  const location = env.MEASURE_LOCATION?.trim() ?? "";
  if (location === "") throw new Error("Set MEASURE_LOCATION='<city, connection>'.");
  return location;
}

/** Reads the header's data attributes; refuses a page in mock mode or with no model. */
export async function readDeployment(page: Page): Promise<Deployment> {
  const header = page.locator("header[data-model]");
  await expect(header).toBeVisible();
  if ((await header.getAttribute("data-mock")) !== null) {
    throw new Error("Refusing to measure: the page is in mock mode (data-mock).");
  }
  const model = ((await header.getAttribute("data-model")) ?? "").trim();
  if (model === "") throw new Error("Refusing to measure: data-model is empty.");
  return { model, commit: (await header.getAttribute("data-commit")) ?? "" };
}

/** The repo root, where measurements/ lives: the parent of the e2e/ test directory. */
export function repoRoot(testInfo: TestInfo): string {
  return path.resolve(testInfo.project.testDir, "..");
}

/**
 * Runs every guard before the first request that spends anything, cheapest first:
 * MEASURE_LOCATION, the target URL, no good file for today yet (it could not be saved
 * anyway), then one page load that must not be in mock mode.
 */
export async function startMeasurement(options: {
  metric: string;
  browser: Browser;
  baseURL: string | undefined;
  /** Usually repoRoot(testInfo). */
  root: string;
  env?: Env;
}): Promise<MeasurementMeta> {
  const { metric, browser, baseURL, root, env } = options;
  const location = measureLocation(env);
  if (!baseURL) throw new Error("Set MEASURE_URL to the deployed URL.");
  const date = new Date().toISOString();
  const goodPath = measurementPath(metric, { date, aborted: false });
  assertSafeToWrite(goodPath, false, existsSync(path.join(root, goodPath)));

  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto("/");
    const { model, commit } = await readDeployment(page);
    return {
      date,
      url: baseURL,
      model,
      location,
      userAgent: await page.evaluate(() => navigator.userAgent),
      browserVersion: browser.version(),
      platform: `${process.platform} ${release()}`,
      commit,
    };
  } finally {
    await context.close();
  }
}

/**
 * Writes the run's JSON under root and returns its repo-relative path. A good run never
 * overwrites an earlier good file; an aborted run gets its own time-stamped .aborted.json.
 */
export async function saveMeasurement<Run extends { date: string; aborted: boolean }>(
  root: string,
  metric: string,
  record: Run,
): Promise<string> {
  const relativePath = measurementPath(metric, record);
  const file = path.join(root, relativePath);
  assertSafeToWrite(relativePath, record.aborted, existsSync(file));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`);
  return relativePath;
}

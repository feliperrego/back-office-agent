import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  measureLocation,
  readDeployment,
  saveMeasurement,
  startMeasurement,
} from "./helpers/measure";

// The measurement guards (template spec §7.5), checked against the local mock build. No test here
// writes outside its own Playwright output folder.

const METRIC = "guard-check";

/** A page header with the attributes of template spec §5.6, with text so that it is visible. */
function header(attributes: string): string {
  return `<header ${attributes}>Header</header>`;
}

test.describe("measurement guards", () => {
  test("MEASURE_LOCATION is required and trimmed", () => {
    expect(() => measureLocation({})).toThrow("Set MEASURE_LOCATION='<city, connection>'.");
    expect(() => measureLocation({ MEASURE_LOCATION: "   " })).toThrow("Set MEASURE_LOCATION");
    expect(measureLocation({ MEASURE_LOCATION: " Recife, home fibre " })).toBe(
      "Recife, home fibre",
    );
  });

  test("readDeployment reads the header and refuses mock mode or an empty model", async ({
    page,
  }) => {
    await page.setContent(header('data-model=" provider/model-x " data-commit="abc1234"'));
    expect(await readDeployment(page)).toEqual({ model: "provider/model-x", commit: "abc1234" });

    await page.setContent(header('data-model="mock" data-commit="local" data-mock'));
    await expect(readDeployment(page)).rejects.toThrow(/mock mode/);

    await page.setContent(header('data-model=" " data-commit="local"'));
    await expect(readDeployment(page)).rejects.toThrow(/data-model is empty/);
  });

  test("startMeasurement checks MEASURE_LOCATION before loading the page", async ({
    browser,
    baseURL,
  }, testInfo) => {
    // The local page is in mock mode, so a page load first would fail with the mock error.
    await expect(
      startMeasurement({ metric: METRIC, browser, baseURL, root: testInfo.outputPath(), env: {} }),
    ).rejects.toThrow(/MEASURE_LOCATION/);
  });

  test("startMeasurement refuses a good file for today before loading the page", async ({
    browser,
    baseURL,
  }, testInfo) => {
    const root = testInfo.outputPath();
    const today = new Date().toISOString().slice(0, 10);
    const existing = path.join(root, "measurements", `${METRIC}-${today}.json`);
    await mkdir(path.dirname(existing), { recursive: true });
    await writeFile(existing, "{}\n");

    await expect(
      startMeasurement({
        metric: METRIC,
        browser,
        baseURL,
        root,
        env: { MEASURE_LOCATION: "Test" },
      }),
    ).rejects.toThrow(/already exists/);
  });

  test("a good file for one run does not block the next run of the same metric", async ({
    browser,
    baseURL,
  }, testInfo) => {
    // A metric measured over several runs names each run apart (template spec §7.5).
    const root = testInfo.outputPath();
    const today = new Date().toISOString().slice(0, 10);
    const firstRun = path.join(root, "measurements", `${METRIC}-run-1-${today}.json`);
    await mkdir(path.dirname(firstRun), { recursive: true });
    await writeFile(firstRun, "{}\n");

    // Past the file guard, the next check is the page, which is in mock mode locally.
    await expect(
      startMeasurement({
        metric: `${METRIC}-run-2`,
        browser,
        baseURL,
        root,
        env: { MEASURE_LOCATION: "Test" },
      }),
    ).rejects.toThrow("Refusing to measure: the page is in mock mode (data-mock).");
  });

  test("startMeasurement refuses the page in mock mode", async ({ browser, baseURL }, testInfo) => {
    await expect(
      startMeasurement({
        metric: METRIC,
        browser,
        baseURL,
        root: testInfo.outputPath(),
        env: { MEASURE_LOCATION: "Test" },
      }),
    ).rejects.toThrow("Refusing to measure: the page is in mock mode (data-mock).");
  });

  test("saveMeasurement writes a good run once and never overwrites it", async ({}, testInfo) => {
    const root = testInfo.outputPath();
    const first = { date: "2026-10-02T14:03:59.123Z", aborted: false, value: 1 };

    const relativePath = await saveMeasurement(root, METRIC, first);

    expect(relativePath).toBe(`measurements/${METRIC}-2026-10-02.json`);
    const file = path.join(root, relativePath);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(first);
    await expect(saveMeasurement(root, METRIC, { ...first, value: 2 })).rejects.toThrow(
      /already exists/,
    );
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(first);
  });

  test("saveMeasurement gives an aborted run its own time-stamped file", async ({}, testInfo) => {
    const root = testInfo.outputPath();
    const date = "2026-10-02T14:03:59.123Z";
    await saveMeasurement(root, METRIC, { date, aborted: false });

    const relativePath = await saveMeasurement(root, METRIC, { date, aborted: true });

    expect(relativePath).toBe(`measurements/${METRIC}-2026-10-02-140359.aborted.json`);
    expect(existsSync(path.join(root, relativePath))).toBe(true);
  });
});

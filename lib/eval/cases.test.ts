import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CASES_PATH,
  CASES_SHA256_PATH,
  frozenCaseSetHash,
  parseCaseSet,
  readCaseSet,
  sha256Line,
} from "./cases";

// The frozen cases (template spec §5.11): written before any run and never tuned to a model, and
// checked against their recorded SHA-256 before any case is asked.

const SET = {
  about: "Two frozen cases.",
  frozenOn: "2026-10-05",
  cases: [
    { id: "c01", group: "lookup", message: "One?" },
    { id: "c02", group: "general", message: "Two?" },
  ],
};

let root: string;

function write(file: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "cases-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("frozenCaseSetHash", () => {
  it("gives the set's SHA-256 when it is the one recorded, in sha256sum format", () => {
    const text = `${JSON.stringify(SET, null, 2)}\n`;
    write(CASES_PATH, text);
    write(CASES_SHA256_PATH, `${hash(text)}  cases.json\n`);
    expect(frozenCaseSetHash(root)).toBe(hash(text));
  });

  it("refuses a set edited after its hash was recorded, or one with no recorded hash", () => {
    const text = `${JSON.stringify(SET, null, 2)}\n`;
    write(CASES_PATH, `${text} `);
    write(CASES_SHA256_PATH, `${hash(text)}  cases.json\n`);
    expect(() => frozenCaseSetHash(root)).toThrow(
      `${CASES_PATH} is not the frozen set: its SHA-256 is not ${CASES_SHA256_PATH}'s.`,
    );
    rmSync(path.join(root, CASES_SHA256_PATH));
    expect(() => frozenCaseSetHash(root)).toThrow(/ENOENT/);
  });
});

describe("parseCaseSet", () => {
  it("reads the set, its day and its cases, in order", () => {
    expect(parseCaseSet(JSON.stringify(SET), CASES_PATH)).toEqual(SET);
  });

  it.each([
    ["no cases", { ...SET, cases: [] }, /at least one case/],
    ["a day that is not YYYY-MM-DD", { ...SET, frozenOn: "5 Oct 2026" }, /frozenOn/],
    ["no about", { frozenOn: SET.frozenOn, cases: SET.cases }, /about/],
    ["a case without an id", { ...SET, cases: [{ group: "lookup" }] }, /case 1 has no id/],
    ["a case without a group", { ...SET, cases: [{ id: "c01" }] }, /c01 has no group/],
    ["two cases with one id", { ...SET, cases: [SET.cases[0], SET.cases[0]] }, /c01 twice/],
  ])("refuses a set with %s", (_, set, error) => {
    expect(() => parseCaseSet(JSON.stringify(set), CASES_PATH)).toThrow(error);
  });
});

describe("the committed set", () => {
  it("is the file whose SHA-256 is recorded, so no edit goes unnoticed", () => {
    const bytes = readFileSync(CASES_PATH);
    expect(readFileSync(CASES_SHA256_PATH, "utf8")).toBe(sha256Line(bytes));
    expect(frozenCaseSetHash()).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it("is a set the eval can read", () => {
    const set = readCaseSet();
    expect(set.cases.length).toBeGreaterThan(0);
    expect(set.frozenOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

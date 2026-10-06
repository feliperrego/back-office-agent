import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { type EvalCase, MEASUREMENTS_DIR } from "./record";

/**
 * The frozen cases (template spec §5.11): measurements/cases.json, written before the first run
 * and never tuned to a model. Its SHA-256 is recorded in CASES_SHA256_PATH in `sha256sum` format,
 * so `cd measurements && shasum -a 256 -c cases.sha256` checks it, and the eval checks it before
 * any case is asked. The cases themselves are the project's (lib/eval/project.ts). Shell-owned.
 * Server-only: it reads the files from disk.
 */
export const CASES_PATH = `${MEASUREMENTS_DIR}/cases.json`;
export const CASES_SHA256_PATH = `${MEASUREMENTS_DIR}/cases.sha256`;

export type CaseSet<Case extends EvalCase = EvalCase> = {
  /** What the set is and how it was written. */
  about: string;
  /** The day the set was frozen, before any run. */
  frozenOn: string;
  cases: Case[];
};

/** The line of CASES_SHA256_PATH for these bytes, as `sha256sum` writes it. */
export function sha256Line(bytes: Buffer): string {
  const hash = createHash("sha256").update(bytes).digest("hex");
  return `${hash}  ${path.posix.basename(CASES_PATH)}\n`;
}

/** The frozen set's SHA-256, after checking that it is the one recorded; `root` is the repo. */
export function frozenCaseSetHash(root: string = process.cwd()): string {
  const sha256 = createHash("sha256")
    .update(readFileSync(path.join(root, CASES_PATH)))
    .digest("hex");
  const recorded = readFileSync(path.join(root, CASES_SHA256_PATH), "utf8").split(/\s+/)[0];
  if (sha256 !== recorded) {
    throw new Error(
      `${CASES_PATH} is not the frozen set: its SHA-256 is not ${CASES_SHA256_PATH}'s.`,
    );
  }
  return sha256;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * The set a file holds, checked for what the shell reads of it: an about, the day it was frozen,
 * and at least one case, each with its own id and a group. The project's test checks the rest.
 */
export function parseCaseSet<Case extends EvalCase = EvalCase>(
  text: string,
  file: string,
): CaseSet<Case> {
  const set: unknown = JSON.parse(text);
  if (!isRecord(set) || !isText(set.about)) throw new Error(`${file} has no about.`);
  if (typeof set.frozenOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(set.frozenOn)) {
    throw new Error(`${file}: frozenOn is not a day (YYYY-MM-DD).`);
  }
  if (!Array.isArray(set.cases) || set.cases.length === 0) {
    throw new Error(`${file} holds no case: a run needs at least one case.`);
  }
  const ids = new Set<string>();
  for (const [i, each] of set.cases.entries()) {
    if (!isRecord(each) || !isText(each.id)) throw new Error(`${file}: case ${i + 1} has no id.`);
    if (!isText(each.group)) throw new Error(`${file}: ${each.id} has no group.`);
    if (ids.has(each.id)) throw new Error(`${file} holds ${each.id} twice.`);
    ids.add(each.id);
  }
  return set as CaseSet<Case>;
}

/** The frozen set; `root` is the repo. */
export function readCaseSet<Case extends EvalCase = EvalCase>(
  root: string = process.cwd(),
): CaseSet<Case> {
  return parseCaseSet<Case>(readFileSync(path.join(root, CASES_PATH), "utf8"), CASES_PATH);
}

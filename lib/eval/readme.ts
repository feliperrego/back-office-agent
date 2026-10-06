import { PRODUCT_NAME } from "@/lib/project";
import type { EvalRun, HeadlineNumbers } from "./record";
import { headlineNumbers } from "./summary";

/**
 * The README lines a run prints (template spec §5.11, §8): line 1, with the project's sentence and
 * the interval, labelled "Wilson score" when it is not the bootstrap's, and the first line of
 * "How it's measured", with the set, the model, the day, the commit, each group, the failures,
 * and the median time and tokens per case. The caveats that follow that line are the project's,
 * written by hand. Shell-owned. Pure.
 */

export type ReadmeLines = { title: string; howMeasured: string };

/** README line 1 and the first line of "How it's measured", for a run that was not aborted. */
export function readmeLines(
  run: EvalRun,
  rawData: string,
  /** The project's sentence (EVAL_PROJECT.headline of lib/eval/project.ts). */
  headline: (numbers: HeadlineNumbers) => string,
): ReadmeLines {
  const { summary } = run;
  if (run.aborted || summary === null) {
    throw new Error("An aborted run prints no README lines (template spec §7.5).");
  }
  const numbers = headlineNumbers(summary);
  const { level, low, high } = numbers;
  // The bootstrap's line keeps the form of the earlier projects' numbers; another method is named.
  const method = summary.interval.method === "wilson" ? ", Wilson score" : "";
  const title = `# ${PRODUCT_NAME} — ${headline(numbers)} (${level}% CI ${low}–${high}%${method})`;

  const groups = summary.groups.map(({ group, cases }) => `${cases} ${group}`).join(", ");
  const passed = summary.groups
    .map(({ group, cases, passed }) => `${group} ${passed} of ${cases}`)
    .join(", ");
  const failed = summary.failed.length === 0 ? "" : ` (failed: ${summary.failed.join(", ")})`;
  const commit =
    run.commit === null
      ? ", a mock run, which records no commit"
      : ` at commit ${run.commit.sha.slice(0, 7)}${run.commit.dirty ? " with local changes" : ""}`;
  const tokens =
    summary.tokens.medianPerCase === null
      ? ""
      : ` and ${Math.round(summary.tokens.medianPerCase).toLocaleString("en-US")} tokens`;
  const howMeasured =
    `n=${summary.cases} frozen cases (${groups}), each run once against ${run.model} and scored ` +
    `by script, with no LLM judge, on ${run.date.slice(0, 10)}${commit}; passed: ${passed}` +
    `${failed}; median ${(summary.latency.medianMs / 1000).toFixed(1)} s${tokens} per case · ` +
    `[raw data](${rawData})`;
  return { title, howMeasured };
}

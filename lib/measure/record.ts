/**
 * Where a measurement run's raw JSON goes, and the rule that a good run is never
 * overwritten (template spec §7.5). Generic: each project names its metric (e.g. "ttft") and keeps
 * its own statistics and README lines.
 */

const METRIC_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UTC_ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** The UTC day of an ISO timestamp from `Date.prototype.toISOString()`, YYYY-MM-DD. */
export function measurementDay(isoDate: string): string {
  if (!UTC_ISO_DATE.test(isoDate)) throw new RangeError(`Not a UTC ISO date: ${isoDate}`);
  return isoDate.slice(0, 10);
}

/**
 * Repo-relative path of a run's JSON. A good run writes measurements/<metric>-YYYY-MM-DD.json.
 * An aborted run writes a distinct file time-stamped with the run's start (UTC, HHMMSS), so
 * two aborted runs on the same day never collide, and an aborted run never touches a good
 * run's file.
 */
export function measurementPath(
  metric: string,
  run: { date: string; aborted: boolean },
): string {
  if (!METRIC_NAME.test(metric)) {
    throw new RangeError(`The metric name must be lower-case kebab-case: "${metric}"`);
  }
  const day = measurementDay(run.date);
  if (!run.aborted) return `measurements/${metric}-${day}.json`;
  const time = run.date.slice(11, 19).replace(/:/g, "");
  return `measurements/${metric}-${day}-${time}.aborted.json`;
}

/**
 * Refuses to let a good run overwrite an earlier good file for the same day. An aborted run
 * is always safe (its own file). Pure: the caller passes whether the file already exists.
 */
export function assertSafeToWrite(relativePath: string, aborted: boolean, exists: boolean): void {
  if (aborted || !exists) return;
  throw new Error(
    `${relativePath} already exists from an earlier successful run. ` +
      "Rename or delete it before running the measurement again.",
  );
}

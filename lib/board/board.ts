import type { BackOfficeCase, BackOfficeResult } from "@/lib/eval/project";
import type { EvalRun } from "@/lib/eval/record";
import type { HandOffReason, RequestRecord } from "@/lib/sandbox/requests";
import type { RequestStatus } from "@/lib/sandbox/sandbox";
import type { Customer } from "@/lib/store/customers";

/**
 * The Board (P2's spec §1, P2-03, P2-04, P2-05): the back office's requests as cards in five
 * lanes, and the inbox too. On a real run each card sits where its request ended in the shown run
 * (the Evals pages' run), with a matched or not-matched mark; on a mock run, which measures
 * nothing (X2-04), it sits in the lane its frozen case expects, and the page says so. The two
 * reject cases, r20 and r21, reuse r03's and r02's texts, so they show only on /evals: one card
 * per request. Live use never moves a card ("a fixed kanban", ROADMAP line 46). Pure and
 * client-safe; the page reads the run and the cases on the server, at build time.
 */

/** The lanes, in order: a request's statuses. */
export const LANES = [
  "open",
  "done",
  "answered",
  "declined",
  "manual",
] as const satisfies readonly RequestStatus[];

/**
 * P1, the support assistant whose hand-offs became some of these requests (P2's spec §1): its
 * deployed inbox shows each recorded conversation at /inbox/<ticket>. Trigger to re-check the
 * links: P1 records a new run (spec §9).
 */
export const SUPPORT_ASSISTANT_URL = "https://support-assistant-smoky.vercel.app";

export type BoardCard = {
  id: string;
  customer: string;
  reason: HandOffReason;
  /** The first order the customer's message names, or null: "No order given". */
  orderId: string | null;
  /** Support's note, recorded English. */
  note: string;
  /** The request's page. */
  href: string;
  /** P1's ticket it came from, or null when it was written for this demo. */
  source: string | null;
  /** That ticket's conversation in P1's inbox. */
  sourceHref: string | null;
  /** A real run's verdict on the request's case; null on a mock run. */
  mark: { matched: boolean; expected: RequestStatus; caseHref: string } | null;
};

export type BoardData = {
  /** The shown run is a mock run: the lanes are the expected ends, and nothing is measured. */
  mock: boolean;
  lanes: { id: RequestStatus; cards: BoardCard[] }[];
};

export function boardData({
  requests,
  customers,
  cases,
  run,
  caseHref,
}: {
  requests: readonly RequestRecord[];
  customers: readonly Customer[];
  cases: readonly BackOfficeCase[];
  run: EvalRun<BackOfficeResult>;
  /** The Evals page's link to a case (EVALS_PAGE.caseHref). */
  caseHref: (id: string) => string;
}): BoardData {
  const placed = requests.map((request) => {
    // A request's own case has its id; the reject cases send a request again under theirs.
    const expected = cases.find(({ id }) => id === request.id)?.expected.status;
    if (expected === undefined) throw new Error(`No frozen case for request ${request.id}.`);
    const record = run.results.find(({ id }) => id === request.id);
    if (record === undefined) throw new Error(`The shown run has no case ${request.id}.`);
    const customer = customers.find(({ id }) => id === request.customerId);
    if (customer === undefined) throw new Error(`Unknown customer: ${request.customerId}`);
    const card: BoardCard = {
      id: request.id,
      customer: customer.name,
      reason: request.reason,
      orderId: request.orderId,
      note: request.note,
      href: `/requests/${request.id}`,
      source: request.source,
      sourceHref:
        request.source === null ? null : `${SUPPORT_ASSISTANT_URL}/inbox/${request.source}`,
      mark: run.mock ? null : { matched: record.pass, expected, caseHref: caseHref(request.id) },
    };
    return { lane: run.mock ? expected : record.result.final.status, card };
  });
  return {
    mock: run.mock,
    lanes: LANES.map((id) => ({
      id,
      cards: placed.filter(({ lane }) => lane === id).map(({ card }) => card),
    })),
  };
}

import data from "@/data/requests.json";

/**
 * The 19 back-office requests behind spec §5's 21 cases (P2-06, P2-12): r20 and r21 reuse r03's
 * and r02's texts with another reviewer decision, so they are cases, not requests. Each comes
 * from one customer of P1's store. Seven came from P1's run of 2026-10-05 and keep its ticket
 * text and hand-off note word for word (requests.test.ts pins them against P1's files); the rest
 * were written for this demo. Drafts until Felipe approves them at rollout step 4 (spec §7).
 * The message and the note are customer data, never instructions (spec §3 B8): they reach the
 * model only inside readRequest's output (spec §4.1). Pure and client-safe.
 */
export const REQUESTS_PATH = "data/requests.json";

/**
 * Why P1 handed a conversation to a person, P1's five reasons (support-assistant
 * lib/support/hand-off.ts at f56063b): the request card's reason chip (spec §1).
 */
export const HAND_OFF_REASONS = [
  "refund",
  "order-change",
  "delivery-problem",
  "defect-claim",
  "not-covered",
] as const;
export type HandOffReason = (typeof HAND_OFF_REASONS)[number];

export type RequestRecord = {
  /** "r01" to "r19". */
  id: string;
  /** The customer of data/customers.json who sent it. */
  customerId: string;
  /** The first order the customer's message names, or null: "no order given" on the card. */
  orderId: string | null;
  reason: HandOffReason;
  /** P1's ticket the request came from ("t15"), or null when it was written for this demo. */
  source: string | null;
  /** The customer's own words. */
  message: string;
  /** The note handed over with it: P1's hand-off summary, or one written for this demo. */
  note: string;
};

type RequestsFile = { about: string; requests: RequestRecord[] };

export const REQUESTS: readonly RequestRecord[] = (data as RequestsFile).requests;

export const REQUEST_IDS: readonly string[] = REQUESTS.map(({ id }) => id);

export function isRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_IDS.includes(value);
}

/** The request with this id; throws on an unknown one, which the caller validates first. */
export function requestById(id: string): RequestRecord {
  const request = REQUESTS.find((candidate) => candidate.id === id);
  if (!request) throw new Error(`Unknown request: ${id}`);
  return request;
}

/** The plain-text body of the 400 for a missing or unknown requestId. Honest clients never see it. */
export const REQUEST_ID_ERROR =
  "Invalid request: requestId must be the id of one of the demo's requests.";

/**
 * The request a chat body names (spec §4.3): P2's transport sends its id as `requestId`, and the
 * route accepts only one of REQUEST_IDS exactly, so the model never chooses a request. Null for
 * anything else.
 */
export function requestIdOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { requestId } = body as { requestId?: unknown };
  return isRequestId(requestId) ? requestId : null;
}

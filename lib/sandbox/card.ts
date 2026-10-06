import type { CloseCode, Outcome, ProposedCall } from "./calls";
import { RETURN_WINDOW_DAYS, returnWindowDay } from "./dates";
import {
  apply,
  check,
  customerOf,
  orderOf,
  type DenialCode,
  type RequestStatus,
  type Sandbox,
} from "./sandbox";

/**
 * What the approval card shows for a pending write (spec §4.4, P2-10, P2-22), built from the
 * call's typed input and the sandbox, never from model prose or request text: before → after
 * rows, the "Policy check" line and the "Needs your judgement" line. Each is a code with store
 * values, which the browser words in English and Portuguese; the agent's own text comes apart,
 * for the card to show smaller. Pure and client-safe.
 */

export type CardRow =
  /** "Return: — → Authorized". */
  | { key: "return"; before: null; after: "authorized" }
  /** "Refund due on arrival: $149.00 to the original payment method". */
  | { key: "refund-on-arrival"; amount: number; to: "original payment method" }
  /** "Return shipping: paid by the customer". */
  | { key: "return-shipping"; paidBy: "customer" }
  /** "Acme Loft Insulated Jacket: Men's M, Black → Men's L, Black". */
  | { key: "item"; item: string; before: string; after: string }
  /** "Request: Open → Done". */
  | { key: "request"; before: RequestStatus; after: RequestStatus }
  /** "Reason: outside the 30-day window", closeRequest's code. */
  | { key: "code"; code: CloseCode };

/** A rule the call passed, for the "Policy check" line. */
export type PolicyCheck =
  /** The order is on the request customer's account (contacting-support.md). */
  | { code: "on-account"; orderId: string; customer: string }
  /** Delivered on a day, now day N of 30 (B10). */
  | { code: "in-window"; deliveredOn: string; day: number; of: number }
  /** Neither returned nor authorized before (B3). */
  | { code: "not-returned" }
  /** Shipped free, so the refund is the total and holds no shipping (B4). */
  | { code: "free-shipping" }
  /** Processing: not shipped yet (B5). */
  | { code: "not-shipped" }
  /** The same item in another size (B5). */
  | { code: "same-item" }
  /** The code belongs to the outcome (B2). */
  | { code: "code-fits"; outcome: Outcome }
  /** No write on this request yet: this one closes it (B7). */
  | { code: "first-write" };

/** What code cannot check, for the "Needs your judgement" line: "Unused, with tags" (B9). */
export type JudgementCode = "unused-with-tags";

export type CallCard = {
  rows: CardRow[];
  policy: PolicyCheck[];
  judgement: JudgementCode[];
  /** The model's reason or note: its own words, shown smaller. */
  agentText: string;
};

export type DescribedCall =
  { allowed: true; card: CallCard } | { allowed: false; code: DenialCode };

/** The card for a write the gate allows, or the code of its denial ("Blocked by policy"). */
export function describeCall(proposed: ProposedCall, sandbox: Sandbox): DescribedCall {
  const decision = check(proposed, sandbox);
  if (!decision.allowed) return decision;
  const { call } = decision;
  const after = apply(call, sandbox);
  const request: CardRow = { key: "request", before: "open", after: after.request.status };
  if (call.toolName === "closeRequest") {
    const { outcome, code, note } = call.input;
    return {
      allowed: true,
      card: {
        rows: [request, { key: "code", code }],
        policy: [{ code: "code-fits", outcome }, { code: "first-write" }],
        judgement: [],
        agentText: note,
      },
    };
  }
  const { orderId, reason } = call.input;
  const order = orderOf(sandbox, orderId)!;
  const onAccount: PolicyCheck = {
    code: "on-account",
    orderId,
    customer: customerOf(sandbox).name,
  };
  if (call.toolName === "authorizeReturn") {
    const deliveredOn = order.deliveredOn!;
    const authorization = orderOf(after, orderId)!.returnAuthorization!;
    return {
      allowed: true,
      card: {
        rows: [
          { key: "return", before: null, after: "authorized" },
          { key: "refund-on-arrival", amount: authorization.refundOnArrival, to: authorization.to },
          { key: "return-shipping", paidBy: authorization.returnShippingPaidBy },
          request,
        ],
        policy: [
          onAccount,
          {
            code: "in-window",
            deliveredOn,
            day: returnWindowDay(deliveredOn),
            of: RETURN_WINDOW_DAYS,
          },
          { code: "not-returned" },
          { code: "free-shipping" },
          { code: "first-write" },
        ],
        judgement: ["unused-with-tags"],
        agentText: reason,
      },
    };
  }
  const line = order.items.find(({ name }) => name === call.input.item)!;
  const changed = orderOf(after, orderId)!.items.find(({ name }) => name === call.input.item)!;
  return {
    allowed: true,
    card: {
      rows: [
        { key: "item", item: line.name, before: line.variant!, after: changed.variant! },
        request,
      ],
      policy: [onAccount, { code: "not-shipped" }, { code: "same-item" }, { code: "first-write" }],
      judgement: [],
      agentText: reason,
    },
  };
}

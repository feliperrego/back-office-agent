import { storeData, type Customer, type Order } from "@/lib/store/customers";
import {
  CLOSE_CODES,
  normalizeSize,
  parseCall,
  parseVariant,
  sameKindOfSize,
  type CloseCode,
  type Outcome,
  type ProposedCall,
  type WriteCall,
} from "./calls";
import { TODAY, insideReturnWindow } from "./dates";
import { requestById } from "./requests";

/**
 * One request's sandbox and the gate over it (spec §4.2, P2-18, P2-19): P1's store plus the
 * request's own state, nothing persisted. check(call, sandbox) allows a write or denies it with
 * a code, for every rule of spec §3 that code can hold; the route's toolApproval runs it through
 * propose(), apply() runs it again before it writes, and fold() replays executed writes through
 * apply(). The rules that need judgement stay with the agent and the person: which outcome fits
 * (B2), whether an item is unused (B9), what the request text asks for (B8). Pure and
 * client-safe: every function returns a new sandbox and changes none it is given.
 */

/** The Board's lanes (spec §1): a write closes the request in one of the last four. */
export type RequestStatus = "open" | "done" | Outcome;

/** What an act did, the code of a request that ends Done. */
export const DONE_CODES = {
  authorizeReturn: "return-authorized",
  changeItem: "size-changed",
} as const;
export type DoneCode = (typeof DONE_CODES)[keyof typeof DONE_CODES];

export type RequestState = {
  id: string;
  customerId: string;
  status: RequestStatus;
  code: DoneCode | CloseCode | null;
  /** closeRequest's note: the answer, or why the request was declined or handed on. */
  note: string | null;
  /** The day a write closed the request: today (spec §3 B1). */
  decidedOn: string | null;
};

export type Sandbox = {
  /** Every customer of the store, with the writes applied. */
  customers: Customer[];
  request: RequestState;
  /** The write waiting for a person's decision or for its run, by tool call id (B7). */
  pending: string | null;
  /** Whether a person rejected a write in this conversation (B7). */
  rejected: boolean;
};

/** Why the gate denies a write. Several share a name with the close code the agent then uses. */
export const DENIAL_CODES = [
  /** The input fails its schema, or the tool is not a write. */
  "invalid-input",
  /** B7: a write already closed the request. */
  "request-closed",
  /** B7: a person rejected a write; the agent neither retries nor works around it. */
  "after-rejection",
  /** B7: another write already waits for a decision. */
  "proposal-pending",
  /** contacting-support.md: the order is not on this customer's account, or does not exist. */
  "not-on-account",
  /** B3: the order already came back and was refunded. */
  "already-returned",
  /** B3: the order is processing or on its way. */
  "not-delivered-yet",
  /** B3: the order already has a return authorization. */
  "already-authorized",
  /** B10: day 31 or later after the delivery. */
  "outside-window",
  /** B4: the total includes shipping, and a shipping refund is manual handling. */
  "shipping-refund",
  /** B5: the order has shipped, so its items no longer change. */
  "already-shipped",
  /** B5: the order has no item of that name. */
  "no-such-item",
  /** B5: the item has no size (a colour, a length, nothing). */
  "no-size",
  /** B5: not a known size, or a size of another kind (a letter size for boots). */
  "invalid-size",
  /** B5: the item already has that size. */
  "same-size",
  /** B2: the code belongs to another outcome. */
  "code-mismatch",
] as const;
export type DenialCode = (typeof DENIAL_CODES)[number];

export type Decision = { allowed: true; call: WriteCall } | { allowed: false; code: DenialCode };

/** How a SandboxDenied's message starts; its code follows. */
const DENIED_PREFIX = "Denied by the sandbox's policy: ";

/** Thrown by apply() for a write the gate denies: a tool error, never a silent change. */
export class SandboxDenied extends Error {
  constructor(readonly code: DenialCode) {
    super(`${DENIED_PREFIX}${code}`);
    this.name = "SandboxDenied";
  }
}

/**
 * The code of a SandboxDenied's message, as a refused write's tool error carries it to the
 * browser (lib/agent/pipeline.ts), or null for any other text.
 */
export function deniedCodeOf(text: string): DenialCode | null {
  if (!text.startsWith(DENIED_PREFIX)) return null;
  const code = text.slice(DENIED_PREFIX.length);
  return (DENIAL_CODES as readonly string[]).includes(code) ? (code as DenialCode) : null;
}

/** A request's sandbox before any write: a copy of the seed, the request open. */
export function openSandbox(requestId: string): Sandbox {
  const { id, customerId } = requestById(requestId);
  return {
    customers: structuredClone(storeData.customers),
    request: { id, customerId, status: "open", code: null, note: null, decidedOn: null },
    pending: null,
    rejected: false,
  };
}

/** The request's customer, as the sandbox has them. */
export function customerOf(sandbox: Sandbox): Customer {
  const customer = sandbox.customers.find(({ id }) => id === sandbox.request.customerId);
  if (!customer) throw new Error(`Unknown customer: ${sandbox.request.customerId}`);
  return customer;
}

/** An order on the request customer's account; another customer's order is not found either. */
export function orderOf(sandbox: Sandbox, orderId: string): Order | undefined {
  return customerOf(sandbox).orders.find(({ id }) => id === orderId);
}

const deny = (code: DenialCode): Decision => ({ allowed: false, code });

function checkReturn(order: Order): DenialCode | null {
  if (order.status === "returned") return "already-returned";
  if (order.status !== "delivered" || !order.deliveredOn) return "not-delivered-yet";
  if (order.returnAuthorization) return "already-authorized";
  if (!insideReturnWindow(order.deliveredOn)) return "outside-window";
  if (order.shippingCost !== 0) return "shipping-refund";
  return null;
}

function checkSizeChange(order: Order, item: string, newSize: string): DenialCode | null {
  if (order.status !== "processing") return "already-shipped";
  const found = order.items.find(({ name }) => name === item);
  if (!found) return "no-such-item";
  const variant = found.variant === undefined ? null : parseVariant(found.variant);
  if (!variant) return "no-size";
  if (normalizeSize(newSize) !== newSize || !sameKindOfSize(variant.size, newSize)) {
    return "invalid-size";
  }
  if (variant.size === newSize) return "same-size";
  return null;
}

/**
 * The gate (spec §4.2): whether this write may reach a person's card, or be applied. In order:
 * the input's schema; B7's one write, no retry and one proposal at a time (the pending call
 * itself passes, as on the approval's continuation); the order on the customer's account; then
 * the tool's own rules.
 */
export function check(proposed: ProposedCall, sandbox: Sandbox): Decision {
  const call = parseCall(proposed);
  if (!call) return deny("invalid-input");
  if (sandbox.request.status !== "open") return deny("request-closed");
  if (sandbox.rejected) return deny("after-rejection");
  if (sandbox.pending !== null && sandbox.pending !== call.toolCallId) {
    return deny("proposal-pending");
  }
  if (call.toolName === "closeRequest") {
    const codes: readonly string[] = CLOSE_CODES[call.input.outcome];
    return codes.includes(call.input.code) ? { allowed: true, call } : deny("code-mismatch");
  }
  const order = orderOf(sandbox, call.input.orderId);
  if (!order) return deny("not-on-account");
  const denied =
    call.toolName === "authorizeReturn"
      ? checkReturn(order)
      : checkSizeChange(order, call.input.item, call.input.newSize);
  return denied ? deny(denied) : { allowed: true, call };
}

/**
 * The gate's own step, for the calls of one model step, which the SDK checks one after another
 * against the same messages (spec §4.2): an allowed write becomes the request's one pending
 * proposal, so a second write in the same step is denied. A denied call leaves the sandbox as it
 * was.
 */
export function propose(
  proposed: ProposedCall,
  sandbox: Sandbox,
): { decision: Decision; sandbox: Sandbox } {
  const decision = check(proposed, sandbox);
  if (!decision.allowed) return { decision, sandbox };
  return { decision, sandbox: { ...sandbox, pending: decision.call.toolCallId } };
}

/** The order with one change, in a copy of the request customer's orders. */
function withOrder(sandbox: Sandbox, orderId: string, change: (order: Order) => Order): Customer[] {
  return sandbox.customers.map((customer) =>
    customer.id !== sandbox.request.customerId
      ? customer
      : {
          ...customer,
          orders: customer.orders.map((order) => (order.id === orderId ? change(order) : order)),
        },
  );
}

/**
 * Runs an approved write: checks it again, then returns the sandbox it leaves (spec §4.2). Any
 * write closes the request and clears the pending proposal (B7). Throws SandboxDenied for a write
 * the gate denies.
 */
export function apply(proposed: ProposedCall, sandbox: Sandbox): Sandbox {
  const decision = check(proposed, sandbox);
  if (!decision.allowed) throw new SandboxDenied(decision.code);
  const { call } = decision;
  const decided = { pending: null, rejected: sandbox.rejected };
  if (call.toolName === "closeRequest") {
    const { outcome, code, note } = call.input;
    return {
      ...decided,
      customers: sandbox.customers,
      request: { ...sandbox.request, status: outcome, code, note, decidedOn: TODAY },
    };
  }
  const done = { ...sandbox.request, status: "done" as const, decidedOn: TODAY };
  if (call.toolName === "authorizeReturn") {
    // B3: the whole order, its total, to the original payment method, when the return arrives;
    // the customer pays the return shipping. B1: dated today. The status stays "delivered".
    const customers = withOrder(sandbox, call.input.orderId, (order) => ({
      ...order,
      returnAuthorization: {
        authorizedOn: TODAY,
        refundOnArrival: order.total,
        to: "original payment method",
        returnShippingPaidBy: "customer",
      },
    }));
    return { ...decided, customers, request: { ...done, code: DONE_CODES.authorizeReturn } };
  }
  // B5: the same item in the new size; who it is for and its colour stay, and so does the price.
  const { item, newSize } = call.input;
  const customers = withOrder(sandbox, call.input.orderId, (order) => ({
    ...order,
    items: order.items.map((line) => {
      const variant = line.name === item && line.variant ? parseVariant(line.variant) : null;
      return variant ? { ...line, variant: `${variant.who} ${newSize}${variant.rest}` } : line;
    }),
  }));
  return { ...decided, customers, request: { ...done, code: DONE_CODES.changeItem } };
}

import { READ_TOOL, isWriteTool, type WriteToolName } from "@/lib/sandbox/calls";
import { DEFAULT_MOCK_TEXT, type MockPrompt, type MockScenarios } from "./mock-steps";

/**
 * P2's mock scenarios (template spec §5.2; P2's spec §4.7, P2-23): the cues the mock reads in a
 * user message and the answers it gives, so CI and Preview never call a model. Project-owned; it
 * keeps the MOCK_SCENARIOS export, which lib/ai/mock.ts reads. Nothing here imports lib/chat/.
 *
 * "Handle this request." reads the request, then plays its plan: the one write spec §5 expects
 * for it, which the gate sends to a person's card; after the write runs, one sentence. "Read this
 * request." reads it and sums it up, with no write. After a denied or failed call the mock
 * answers with text and makes no new call: W-P11, fixed here in P2's own file, since the shell's
 * step machine reads JSON results only and would start over from the user message. The plans'
 * notes and reasons are the mock's own words; an answered plan's note holds its case's required
 * phrase (measurements/cases.json), so the mock eval passes every case (lib/eval/project.test.ts).
 */

/**
 * The message that starts the work (P2's spec §1, "Handle this request"), as the request page's
 * button sends it in English and in Portuguese (request.handleMessage).
 */
export const HANDLE_CUE = /\bhandle this request\b|\btrate esta solicitação/i;

/** The message that reads the request and does nothing else: the shell's tool e2e asks it. */
export const READ_CUE = /\bread this request\b/i;

/** A write the mock proposes, as the model would call it. */
export type MockPlan = { toolName: WriteToolName; input: Record<string, unknown> };

const close = (outcome: string, code: string, note: string): MockPlan => ({
  toolName: "closeRequest",
  input: { outcome, code, note },
});

/** Each request's plan: the write that ends it where spec §5's table expects. */
export const MOCK_PLANS: Record<string, MockPlan> = {
  r01: {
    toolName: "authorizeReturn",
    input: {
      orderId: "AO-10468",
      reason: "The rain jacket from her last delivery doesn't fit; the order is on day 9 of 30.",
    },
  },
  r02: {
    toolName: "changeItem",
    input: {
      orderId: "AO-10583",
      item: "Acme Loft Insulated Jacket",
      newSize: "L",
      reason: "The customer asks for size L instead of M, and the order has not shipped.",
    },
  },
  r03: {
    toolName: "changeItem",
    input: {
      orderId: "AO-10589",
      item: "Acme Merino Hiking Socks (2-pack)",
      newSize: "L",
      reason:
        "The customer asks for the socks in size L instead of M, and the order has not shipped.",
    },
  },
  r04: close(
    "answered",
    "policy-question",
    "Returned items must be unused, with the tags still attached, so a jacket worn on a hike can't be returned.",
  ),
  r05: close(
    "answered",
    "policy-question",
    "The shipping address of an order can change until the order ships, not after.",
  ),
  r06: close(
    "declined",
    "outside-window",
    "AO-10307 was delivered on August 26, so day 36 is past the 30-day return window.",
  ),
  r07: close("declined", "already-returned", "AO-10326 was already returned and refunded."),
  r08: close("declined", "already-shipped", "AO-10561 has shipped, so its items no longer change."),
  r09: close(
    "declined",
    "already-shipped",
    "AO-10570 has shipped, so its address no longer changes.",
  ),
  r10: close(
    "manual",
    "carrier-investigation",
    "AO-10512 shows as delivered but the customer can't find it; a person opens a carrier investigation.",
  ),
  r11: close(
    "manual",
    "defect-claim",
    "A tent pole cracked; a person handles the defect claim and the new pole.",
  ),
  r12: close(
    "manual",
    "not-covered",
    "The policies don't mention a student discount, so a person answers.",
  ),
  r13: close(
    "manual",
    "warranty-claim",
    "The strap seam split on day 49, past the return window and inside the 1-year warranty; a person handles the claim.",
  ),
  r14: close(
    "manual",
    "no-tool",
    "AO-10589 has not shipped, so its address can change, but no tool does it; a person updates it.",
  ),
  r15: close(
    "declined",
    "outside-window",
    "AO-10214 was delivered on August 12, so day 50 is past the 30-day return window.",
  ),
  r16: close(
    "manual",
    "no-tool",
    "AO-10583 has not shipped, so its address can change, but no tool does it; a person updates it.",
  ),
  r17: close(
    "declined",
    "not-on-account",
    "AO-10468 is not on this customer's account, so it can't be refunded here.",
  ),
  r18: close(
    "declined",
    "not-delivered-yet",
    "AO-10547 has not been delivered yet, so it can't be returned now.",
  ),
  r19: close(
    "answered",
    "order-status",
    "AO-10561 is on its way, estimated to arrive on October 8; it counts as late only from October 14.",
  ),
};

/** The mock's answer after a call a person or the gate denied: W-P11. */
export const DENIED_ANSWER =
  "Understood: that change did not go ahead, and I won't retry it. The request stays open.";

/** The mock's answer after a call that failed, such as a second write the sandbox refused. */
export const FAILED_ANSWER = "That change could not run, and I won't retry it.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** What the mock reads of readRequest's output (lib/tools.ts); null for anything else. */
type Reading = { id: string; status: string; code: string | null; name: string; orders: number };

function readingOf(value: unknown): Reading | null {
  if (!isRecord(value) || !isRecord(value.request) || !isRecord(value.customer)) return null;
  const { id, status, code } = value.request;
  const { name } = value.customer;
  if (typeof id !== "string" || typeof status !== "string" || typeof name !== "string") {
    return null;
  }
  if (!Array.isArray(value.orders)) return null;
  return {
    id,
    status,
    code: typeof code === "string" ? code : null,
    name,
    orders: value.orders.length,
  };
}

/** "Read this request.": who sent it and how many orders they have. */
export function readAnswer(value: unknown): string {
  const reading = readingOf(value);
  if (reading === null) return "I couldn't read this request.";
  const orders = reading.orders === 1 ? "1 order" : `${reading.orders} orders`;
  return `Request ${reading.id} is from ${reading.name}, who has ${orders}. Ask me to handle it when you are ready.`;
}

/** "Handle this request." on a request a write already closed. */
export function closedAnswer(value: unknown): string {
  const reading = readingOf(value);
  if (reading === null) return "I couldn't read this request.";
  return `Request ${reading.id} is already closed: ${reading.status} (${reading.code}).`;
}

/** After a write ran: where it left the request, from its output (lib/tools.ts WriteResult). */
export function writeAnswer(value: unknown): string {
  const request = isRecord(value) && isRecord(value.request) ? value.request : {};
  return `Applied. Request ${String(request.id)} is now ${String(request.status)} (${String(request.code)}).`;
}

/**
 * How the prompt's closing tool message ended its calls, when none returned JSON: "denied" for
 * an execution-denied result (a person's rejection or the gate's denial), "failed" for an error.
 * Null when the prompt does not end with a tool message, or when a call returned JSON (the step
 * machine passes that one to afterTool).
 */
export function refusalOf(prompt: MockPrompt): "denied" | "failed" | null {
  const last = prompt.at(-1);
  if (last?.role !== "tool") return null;
  const results = last.content.flatMap((part) => (part.type === "tool-result" ? [part] : []));
  if (results.length === 0 || results.some(({ output }) => output.type === "json")) return null;
  return results.some(({ output }) => output.type === "execution-denied") ? "denied" : "failed";
}

/** P2's cues and answers, which the step machine of lib/ai/mock-steps.ts runs. */
export const MOCK_SCENARIOS: MockScenarios = {
  firstStep({ prompt, message, toolCallId }) {
    const refusal = refusalOf(prompt);
    if (refusal !== null) {
      return { kind: "text", text: refusal === "denied" ? DENIED_ANSWER : FAILED_ANSWER };
    }
    if (HANDLE_CUE.test(message) || READ_CUE.test(message)) {
      return { kind: "tool-call", toolCallId, toolName: READ_TOOL, input: {} };
    }
    return { kind: "text", text: DEFAULT_MOCK_TEXT };
  },
  afterTool({ toolName, value }, { message, toolCallId }) {
    if (isWriteTool(toolName)) return { kind: "text", text: writeAnswer(value) };
    if (toolName !== READ_TOOL) return undefined;
    const reading = readingOf(value);
    if (reading === null) return undefined;
    if (!HANDLE_CUE.test(message)) return { kind: "text", text: readAnswer(value) };
    if (reading.status !== "open") return { kind: "text", text: closedAnswer(value) };
    const plan = MOCK_PLANS[reading.id];
    if (plan === undefined) return { kind: "text", text: readAnswer(value) };
    return { kind: "tool-call", toolCallId, ...plan };
  },
};

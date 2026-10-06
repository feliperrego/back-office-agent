import { z } from "zod";

/**
 * The agent's tool calls as the sandbox reads them (spec §4.1, P2-09): one read and three
 * writes, the writes' inputs, closeRequest's outcomes and its closed list of codes, and the
 * sizes an item change may ask for. lib/tools.ts builds the model's tools on these inputs, so
 * the gate, apply and the card check exactly what the model may send. Pure and client-safe.
 */

/** readRequest() takes no input and needs no approval. */
export const READ_TOOL = "readRequest";

/** The tools that change the sandbox; each needs a person's approval (spec §4.1). */
export const WRITE_TOOLS = ["authorizeReturn", "changeItem", "closeRequest"] as const;
export type WriteToolName = (typeof WRITE_TOOLS)[number];

export function isWriteTool(name: string): name is WriteToolName {
  return (WRITE_TOOLS as readonly string[]).includes(name);
}

/**
 * How closeRequest ends a request: answered, declined or manual handling (spec §3 B2; no
 * "escalate", since this back office is the desk P1 hands to).
 */
export const OUTCOMES = ["answered", "declined", "manual"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/**
 * The closed list of codes, by outcome: every code of spec §5's table, plus item-condition, the
 * decline of a worn, washed or altered item (spec §3 B9, returns.md). Manual handling covers what
 * no tool does (B6): defects and damage (defect-claim), warranty claims, carrier investigations,
 * a change the policy allows but no tool makes (no-tool: an address, a cancellation, a partial
 * return) and what the policy is silent on (not-covered: goodwill, discounts, B11).
 */
export const CLOSE_CODES = {
  answered: ["policy-question", "order-status"],
  declined: [
    "outside-window",
    "already-returned",
    "not-delivered-yet",
    "already-shipped",
    "not-on-account",
    "item-condition",
  ],
  manual: ["carrier-investigation", "defect-claim", "warranty-claim", "not-covered", "no-tool"],
} as const satisfies Record<Outcome, readonly string[]>;
export type CloseCode = (typeof CLOSE_CODES)[Outcome][number];

const ALL_CLOSE_CODES = Object.values(CLOSE_CODES).flat() as [CloseCode, ...CloseCode[]];

/** The outcome a code belongs to. */
export function outcomeOf(code: CloseCode): Outcome {
  return OUTCOMES.find((outcome) => (CLOSE_CODES[outcome] as readonly string[]).includes(code))!;
}

/** Letter sizes, for clothing and socks (spec §3 B5). */
export const LETTER_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

/** US shoe sizes 5 to 15, in half sizes, for boots (spec §3 B5). */
export const SHOE_SIZES: readonly string[] = Array.from({ length: 21 }, (_, index) =>
  String(5 + index / 2),
);

/**
 * The writes' inputs (spec §4.1). No amount, destination or order lines: code computes the
 * refund from the order (B3, B4) and builds the new variant from the old one (B5). Strict, so an
 * extra field is an error rather than dropped; no transforms, so the SDK's re-validation of an
 * approved input sees the input unchanged (ai validate-tool-approvals.ts).
 */
export const WRITE_INPUTS = {
  authorizeReturn: z
    .object({ orderId: z.string().min(1).max(40), reason: z.string().min(1).max(300) })
    .strict(),
  changeItem: z
    .object({
      orderId: z.string().min(1).max(40),
      item: z.string().min(1).max(120),
      newSize: z.string().min(1).max(20),
      reason: z.string().min(1).max(300),
    })
    .strict(),
  closeRequest: z
    .object({
      outcome: z.enum(OUTCOMES),
      code: z.enum(ALL_CLOSE_CODES),
      note: z.string().min(1).max(500),
    })
    .strict(),
} satisfies Record<WriteToolName, z.ZodTypeAny>;

export type WriteInput<T extends WriteToolName> = z.infer<(typeof WRITE_INPUTS)[T]>;

/** A tool call as the SDK or a UI message part carries it: the input is not trusted yet. */
export type ProposedCall = { toolCallId: string; toolName: string; input: unknown };

/** A write whose input passed its schema, with its order id and size normalized. */
export type WriteCall = {
  [T in WriteToolName]: { toolCallId: string; toolName: T; input: WriteInput<T> };
}[WriteToolName];

/**
 * An order id as a person or the model may write it: any case, a leading "#" or "order", a space
 * instead of the hyphen, or the five digits alone. Anything else is only trimmed and upper-cased,
 * and then matches no order. Copied from P1 (support-assistant lib/support/tools.ts at f56063b).
 */
export function normalizeOrderId(written: string): string {
  const text = written.trim().toUpperCase();
  const match = /^(?:ORDER\s+)?#?\s*(?:AO[\s-]?)?(\d{5})$/.exec(text);
  return match ? `AO-${match[1]}` : text;
}

const SIZES: readonly string[] = [...LETTER_SIZES, ...SHOE_SIZES];

/** A size as the store writes it ("L", "8.5"), or null when it is none of the known sizes. */
export function normalizeSize(written: string): string | null {
  const text = written.trim().toUpperCase();
  return SIZES.includes(text) ? text : null;
}

/** Whether two sizes are of the same kind: both letter sizes or both shoe sizes. */
export function sameKindOfSize(a: string, b: string): boolean {
  const letter = (size: string) => (LETTER_SIZES as readonly string[]).includes(size);
  return letter(a) === letter(b);
}

/**
 * The size inside a variant the store writes as "Men's M, Black", "Women's M" or "Men's 10":
 * who it is for, the size, and what follows it. Null for a variant with no size ("Green").
 */
export function parseVariant(variant: string): { who: string; size: string; rest: string } | null {
  const match = /^(Men's|Women's) (\S+?)(, .+)?$/.exec(variant);
  if (!match || normalizeSize(match[2]) !== match[2]) return null;
  return { who: match[1], size: match[2], rest: match[3] ?? "" };
}

/**
 * A write whose input passes its schema, with the order id and a known size normalized; null
 * for a read, an unknown tool or an input the schema refuses.
 */
export function parseCall(call: ProposedCall): WriteCall | null {
  const { toolCallId, toolName } = call;
  if (toolName === "authorizeReturn") {
    const parsed = WRITE_INPUTS.authorizeReturn.safeParse(call.input);
    if (!parsed.success) return null;
    const input = { ...parsed.data, orderId: normalizeOrderId(parsed.data.orderId) };
    return { toolCallId, toolName, input };
  }
  if (toolName === "changeItem") {
    const parsed = WRITE_INPUTS.changeItem.safeParse(call.input);
    if (!parsed.success) return null;
    const { orderId, newSize } = parsed.data;
    const input = {
      ...parsed.data,
      orderId: normalizeOrderId(orderId),
      newSize: normalizeSize(newSize) ?? newSize,
    };
    return { toolCallId, toolName, input };
  }
  if (toolName === "closeRequest") {
    const parsed = WRITE_INPUTS.closeRequest.safeParse(call.input);
    return parsed.success ? { toolCallId, toolName, input: parsed.data } : null;
  }
  return null;
}

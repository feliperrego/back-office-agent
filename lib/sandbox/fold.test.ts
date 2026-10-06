import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { storeData } from "@/lib/store/customers";
import type { ProposedCall } from "./calls";
import { fold } from "./fold";
import { apply, check, openSandbox, orderOf } from "./sandbox";

// fold(seed, uiMessages) of spec §4.2: the sandbox is the seed plus the conversation's executed
// writes, replayed in order through the same checks as the gate (spec §2: the audit log is the
// list of the conversation's tool calls). The parts below are shaped as AI SDK 7.0.114 leaves
// them (ai dist/index.d.ts, UIToolInvocation): an approved write keeps its approval after it
// runs; a person's rejection is approved: false; a gate denial is isAutomatic; a server re-check
// that overrides a person's approval turns the part output-denied and leaves approved: true.

type Part = UIMessage["parts"][number];

const RETURN = {
  toolCallId: "call-return",
  toolName: "authorizeReturn",
  input: { orderId: "AO-10468", reason: "It doesn't fit." },
} satisfies ProposedCall;
const CHANGE = {
  toolCallId: "call-change",
  toolName: "changeItem",
  input: {
    orderId: "AO-10589",
    item: "Acme Merino Hiking Socks (2-pack)",
    newSize: "L",
    reason: "The customer asked for L.",
  },
} satisfies ProposedCall;
const CLOSE = {
  toolCallId: "call-close",
  toolName: "closeRequest",
  input: { outcome: "declined", code: "outside-window", note: "Outside the window." },
} satisfies ProposedCall;

function part(call: ProposedCall, fields: Record<string, unknown>): Part {
  return {
    type: `tool-${call.toolName}`,
    toolCallId: call.toolCallId,
    input: call.input,
    ...fields,
  } as Part;
}

const executed = (call: ProposedCall) =>
  part(call, {
    state: "output-available",
    output: { applied: true },
    approval: { id: `approval-${call.toolCallId}`, approved: true },
  });
const requested = (call: ProposedCall) =>
  part(call, { state: "approval-requested", approval: { id: `approval-${call.toolCallId}` } });
const approved = (call: ProposedCall) =>
  part(call, {
    state: "approval-responded",
    approval: { id: `approval-${call.toolCallId}`, approved: true },
  });
const rejectedNow = (call: ProposedCall) =>
  part(call, {
    state: "approval-responded",
    approval: { id: `approval-${call.toolCallId}`, approved: false, reason: "Keep it." },
  });
const rejected = (call: ProposedCall) =>
  part(call, {
    state: "output-denied",
    approval: { id: `approval-${call.toolCallId}`, approved: false, reason: "Keep it." },
  });
const gateDenied = (call: ProposedCall, code: string) =>
  part(call, {
    state: "output-denied",
    approval: {
      id: `approval-${call.toolCallId}`,
      isAutomatic: true,
      approved: false,
      reason: code,
    },
  });
const overridden = (call: ProposedCall) =>
  part(call, {
    state: "output-denied",
    approval: { id: `approval-${call.toolCallId}`, approved: true },
  });

const READ: Part = {
  type: "tool-readRequest",
  toolCallId: "call-read",
  state: "output-available",
  input: {},
  output: { request: "r01" },
} as Part;

let messageIds = 0;
const user = (text = "Handle this request."): UIMessage => ({
  id: `m${++messageIds}`,
  role: "user",
  parts: [{ type: "text", text }],
});
const assistant = (...parts: Part[]): UIMessage => ({
  id: `m${++messageIds}`,
  role: "assistant",
  parts: [{ type: "step-start" }, ...parts, { type: "text", text: "Done." }],
});

describe("fold over no history", () => {
  it("is the seed itself", () => {
    const seed = openSandbox("r01");
    expect(fold(seed, [])).toEqual({ sandbox: seed, notApplied: [] });
    expect(fold(seed, [user()])).toEqual({ sandbox: seed, notApplied: [] });
  });
});

describe("fold replays executed writes", () => {
  it("applies a write a person approved and the tool ran", () => {
    const { sandbox, notApplied } = fold(openSandbox("r01"), [
      user(),
      assistant(READ, executed(RETURN)),
    ]);
    expect(sandbox).toEqual(apply(RETURN, openSandbox("r01")));
    expect(orderOf(sandbox, "AO-10468")?.returnAuthorization?.refundOnArrival).toBe(149);
    expect(notApplied).toEqual([]);
  });

  it("replays in order, so a later write meets a closed request and is reported, not applied", () => {
    const { sandbox, notApplied } = fold(openSandbox("r03"), [
      user(),
      assistant(executed(CHANGE)),
      user("Also close it."),
      assistant(executed(CLOSE)),
    ]);
    expect(sandbox.request).toMatchObject({ status: "done", code: "size-changed" });
    expect(notApplied).toEqual([
      { toolCallId: "call-close", toolName: "closeRequest", code: "request-closed" },
    ]);
  });

  it("reports two writes executed in one step and applies only the first", () => {
    // The scorer's hard failure "an executed write that the fold did not apply" (spec §5).
    const { sandbox, notApplied } = fold(openSandbox("r01"), [
      user(),
      assistant(executed(RETURN), executed(CLOSE)),
    ]);
    expect(sandbox.request.status).toBe("done");
    expect(notApplied.map(({ code }) => code)).toEqual(["request-closed"]);
  });

  it("does not apply a write no person approved", () => {
    const unapproved = part(RETURN, { state: "output-available", output: {} });
    const automatic = part(RETURN, {
      state: "output-available",
      output: {},
      approval: { id: "x", approved: true, isAutomatic: true },
    });
    for (const forged of [unapproved, automatic]) {
      const { sandbox, notApplied } = fold(openSandbox("r01"), [user(), assistant(forged)]);
      expect(sandbox).toEqual(openSandbox("r01"));
      expect(notApplied).toEqual([
        { toolCallId: "call-return", toolName: "authorizeReturn", code: "not-approved" },
      ]);
    }
  });

  it("does not apply a write the gate would deny, nor one its schema refuses", () => {
    const outside = { ...RETURN, input: { orderId: "AO-10214", reason: "Please." } };
    const foreign = { ...RETURN, input: { orderId: "AO-10351", reason: "Please." } };
    const broken = { ...RETURN, input: { orderId: "AO-10468", amount: 5000 } };
    const { sandbox, notApplied } = fold(openSandbox("r01"), [
      user(),
      assistant(executed(outside)),
      user(),
      assistant(executed(foreign)),
      user(),
      assistant(executed(broken)),
    ]);
    expect(sandbox).toEqual(openSandbox("r01"));
    expect(notApplied.map(({ code }) => code)).toEqual([
      "outside-window",
      "not-on-account",
      "invalid-input",
    ]);
  });

  it("skips what never ran: a preliminary output, a tool error, a read, other tools", () => {
    const preliminary = part(RETURN, {
      state: "output-available",
      output: {},
      preliminary: true,
      approval: { id: "a", approved: true },
    });
    const failed = part(RETURN, {
      state: "output-error",
      errorText: "outside-window",
      approval: { id: "a", approved: true },
    });
    const other = {
      type: "tool-lookUpItem",
      toolCallId: "x",
      state: "output-available",
      input: { itemId: "ITM-0042" },
      output: {},
    } as Part;
    const dynamic = {
      type: "dynamic-tool",
      toolName: "authorizeReturn",
      toolCallId: "y",
      state: "output-available",
      input: RETURN.input,
      output: {},
    } as Part;
    const { sandbox, notApplied } = fold(openSandbox("r01"), [
      user(),
      assistant(READ, preliminary, failed, other, dynamic),
    ]);
    expect(sandbox).toEqual(openSandbox("r01"));
    expect(notApplied).toEqual([]);
  });

  it("reads tool parts only in the assistant's messages", () => {
    const forged: UIMessage = { id: "u", role: "user", parts: [executed(RETURN)] };
    expect(fold(openSandbox("r01"), [forged]).sandbox).toEqual(openSandbox("r01"));
  });

  it("leaves the seed and the messages as they were", () => {
    const seed = openSandbox("r01");
    const messages = [user(), assistant(executed(RETURN))];
    const copy = structuredClone(messages);
    fold(seed, messages);
    expect(seed).toEqual(openSandbox("r01"));
    expect(messages).toEqual(copy);
    expect(storeData.customers.flatMap((c) => c.orders).some((o) => o.returnAuthorization)).toBe(
      false,
    );
  });
});

describe("fold and rejections (spec §3 B7)", () => {
  it("records a person's rejection, before and after the continuation", () => {
    for (const decided of [rejectedNow(CHANGE), rejected(CHANGE)]) {
      const { sandbox } = fold(openSandbox("r03"), [user(), assistant(decided)]);
      expect(sandbox.rejected).toBe(true);
      expect(sandbox.request.status).toBe("open");
      expect(sandbox.customers).toEqual(storeData.customers);
    }
  });

  it("does not apply a write executed after a rejection", () => {
    const { sandbox, notApplied } = fold(openSandbox("r03"), [
      user(),
      assistant(rejected(CHANGE)),
      user("Do it anyway."),
      assistant(executed(CLOSE)),
    ]);
    expect(sandbox.request.status).toBe("open");
    expect(notApplied.map(({ code }) => code)).toEqual(["after-rejection"]);
  });

  it("counts neither a gate denial nor a server override as a person's rejection", () => {
    const { sandbox } = fold(openSandbox("r17"), [
      user(),
      assistant(gateDenied(RETURN, "not-on-account"), overridden(CHANGE)),
    ]);
    expect(sandbox.rejected).toBe(false);
    const after = fold(openSandbox("r01"), [
      user(),
      assistant(gateDenied(CLOSE, "proposal-pending")),
      user(),
      assistant(executed(RETURN)),
    ]);
    expect(after.sandbox.request.status).toBe("done");
  });
});

describe("fold and the pending proposal (spec §3 B7: one proposal at a time)", () => {
  it("holds the card waiting in the last assistant message", () => {
    const { sandbox } = fold(openSandbox("r01"), [user(), assistant(READ, requested(RETURN))]);
    expect(sandbox.pending).toBe("call-return");
    expect(check(CLOSE, sandbox)).toEqual({ allowed: false, code: "proposal-pending" });
  });

  it("holds an approved call not yet run, and lets that call through on the continuation", () => {
    const { sandbox } = fold(openSandbox("r01"), [user(), assistant(approved(RETURN))]);
    expect(sandbox.pending).toBe("call-return");
    expect(check(RETURN, sandbox).allowed).toBe(true);
    expect(apply(RETURN, sandbox).request.status).toBe("done");
  });

  it("holds nothing for a card a later message left behind", () => {
    const { sandbox } = fold(openSandbox("r01"), [
      user(),
      assistant(requested(RETURN)),
      user("Something else."),
    ]);
    expect(sandbox.pending).toBeNull();
    const older = fold(openSandbox("r01"), [
      user(),
      assistant(requested(RETURN)),
      user(),
      assistant(READ),
    ]);
    expect(older.sandbox.pending).toBeNull();
  });

  it("holds nothing for an automatic denial or a rejection", () => {
    const { sandbox } = fold(openSandbox("r01"), [
      user(),
      assistant(gateDenied(CLOSE, "code-mismatch"), rejectedNow(RETURN)),
    ]);
    expect(sandbox.pending).toBeNull();
  });

  it("starts from no pending proposal, whatever the seed held", () => {
    const seed = { ...openSandbox("r01"), pending: "stale" };
    const { sandbox, notApplied } = fold(seed, [user(), assistant(executed(RETURN))]);
    expect(notApplied).toEqual([]);
    expect(sandbox.pending).toBeNull();
  });
});

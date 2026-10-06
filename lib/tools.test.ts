import type { ToolExecutionOptions } from "ai";
import { describe, expect, it } from "vitest";
import { RequestSession } from "@/lib/agent/session";
import { format } from "@/lib/i18n/format";
import { LOCALES } from "@/lib/i18n/locale";
import { messages, toolLabel } from "@/lib/i18n/messages";
import { READ_TOOL, WRITE_INPUTS, WRITE_TOOLS, type ProposedCall } from "@/lib/sandbox/calls";
import { TODAY, orderFacts } from "@/lib/sandbox/dates";
import { REQUESTS, requestById } from "@/lib/sandbox/requests";
import { SandboxDenied, openSandbox, orderOf } from "@/lib/sandbox/sandbox";
import { storeData } from "@/lib/store/customers";
import type { ToolState } from "@/lib/trace/tool-view";
import {
  TOOL_APPROVAL,
  TOOLS,
  readRequestOutput,
  toolsContext,
  type RequestReading,
  type WriteResult,
} from "./tools";

// P2's four tools (spec §4.1, P2-09, P2-19): readRequest, the only way request text reaches the
// model, and three writes a person approves, scoped to the conversation's request through the
// server's tool context; and the gate, streamText's toolApproval (spec §4.2, P2-18).

const RETURN = {
  toolCallId: "call-return",
  toolName: "authorizeReturn",
  input: { orderId: "AO-10468", reason: "It doesn't fit." },
} satisfies ProposedCall;
const CLOSE = {
  toolCallId: "call-close",
  toolName: "closeRequest",
  input: {
    outcome: "manual" as const,
    code: "no-tool" as const,
    note: "A person updates the address.",
  },
} satisfies ProposedCall;
const OUTSIDE = {
  toolCallId: "call-outside",
  toolName: "authorizeReturn",
  input: { orderId: "AO-10214", reason: "Changed her mind." },
} satisfies ProposedCall;

function session(requestId = "r01"): RequestSession {
  return new RequestSession(requestId, []);
}

/** What the SDK passes the gate for one call of a step (ai GenericToolApprovalFunction). */
function gate(call: ProposedCall, current: RequestSession) {
  return TOOL_APPROVAL({
    toolCall: { type: "tool-call", ...call } as never,
    tools: TOOLS,
    toolsContext: toolsContext(current),
    runtimeContext: {},
    messages: [],
  });
}

/** What the SDK passes a tool's execute (ai executeToolCall). */
function options(current: RequestSession, toolCallId = "call-1") {
  return {
    toolCallId,
    messages: [],
    context: { session: current },
  } as unknown as ToolExecutionOptions<{ session: RequestSession }>;
}

describe("TOOLS", () => {
  it("offers the read and the three writes, by the names the sandbox reads", () => {
    expect(Object.keys(TOOLS)).toEqual([READ_TOOL, ...WRITE_TOOLS]);
  });

  // The SDK checks an approved call again with the tool's schema (ai validate-tool-approvals.ts):
  // it must be the one the gate reads, strict and with no transforms (lib/sandbox/calls.ts).
  it("gives each write the sandbox's own input schema", () => {
    for (const name of WRITE_TOOLS) expect(TOOLS[name].inputSchema).toBe(WRITE_INPUTS[name]);
  });

  it("describes every tool to the model", () => {
    for (const [name, tool] of Object.entries(TOOLS)) {
      expect(tool.description?.length ?? 0, name).toBeGreaterThan(80);
    }
  });

  it("scopes every tool to one conversation's session", () => {
    const current = session();
    const context = toolsContext(current);
    expect(Object.keys(context)).toEqual(Object.keys(TOOLS));
    for (const entry of Object.values(context)) expect(entry.session).toBe(current);
  });
});

describe("readRequest", () => {
  it.each(REQUESTS.map(({ id }) => id))(
    "reads %s: its texts as untrusted data, its customer's orders and code's facts",
    (id) => {
      const record = requestById(id);
      const reading: RequestReading = readRequestOutput(openSandbox(id));
      const customer = storeData.customers.find(({ id }) => id === record.customerId)!;

      expect(reading).toEqual({
        today: TODAY,
        request: {
          id,
          handOffReason: record.reason,
          status: "open",
          code: null,
          untrusted: { customerMessage: record.message, handOffNote: record.note },
        },
        customer: { name: customer.name },
        orders: customer.orders.map((order) => ({ ...order, facts: orderFacts(order) })),
      });
    },
  );

  // P2-19, contacting-support.md: nothing of another customer, and never the store's own note.
  it.each(REQUESTS.map(({ id }) => id))(
    "reads %s with no other customer's name, e-mail or order, and no store note",
    (id) => {
      const json = JSON.stringify(readRequestOutput(openSandbox(id)));
      // A request's own text may name another customer's order (r17 names Sofia's); the
      // customer's words are data, so only what code adds is checked.
      const added = json
        .replace(JSON.stringify(requestById(id).message), "")
        .replace(JSON.stringify(requestById(id).note), "");
      const own = requestById(id).customerId;
      for (const other of storeData.customers.filter(({ id }) => id !== own)) {
        expect(added).not.toContain(other.name);
        expect(added).not.toContain(other.email);
        for (const order of other.orders) expect(added).not.toContain(order.id);
      }
      expect(json).not.toContain(storeData.about);
    },
  );

  it("reads the sandbox as it is now, after a write", async () => {
    const current = session();
    current.run(RETURN);
    const reading = (await TOOLS.readRequest.execute!({}, options(current))) as RequestReading;
    expect(reading.request).toMatchObject({ status: "done", code: "return-authorized" });
    const order = reading.orders.find(({ id }) => id === "AO-10468");
    expect(order?.returnAuthorization).toMatchObject({ refundOnArrival: 149 });
  });

  it("needs no input, and ignores any the model adds", () => {
    const schema = TOOLS.readRequest.inputSchema as unknown as {
      safeParse(value: unknown): { success: boolean };
    };
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ requestId: "r05" }).success).toBe(true);
  });
});

describe("the gate, streamText's toolApproval (spec §4.2)", () => {
  it("lets the read run with no approval", async () => {
    const call = { toolCallId: "call-read", toolName: READ_TOOL, input: {} };
    expect(await gate(call, session())).toBe("not-applicable");
  });

  it("sends an allowed write to a person's card", async () => {
    expect(await gate(RETURN, session())).toBe("user-approval");
  });

  it("denies a write the policy refuses, with the code, before any card", async () => {
    expect(await gate(OUTSIDE, session())).toEqual({ type: "denied", reason: "outside-window" });
  });

  it("denies a second write of the same step: one proposal at a time (B7)", async () => {
    const current = session();
    expect(await gate(RETURN, current)).toBe("user-approval");
    expect(await gate(CLOSE, current)).toEqual({ type: "denied", reason: "proposal-pending" });
    // The pending call passes again, as on its approval's continuation.
    expect(await gate(RETURN, current)).toBe("user-approval");
  });

  // N1 of P2's safety design: a write never runs on the gate's word alone.
  it("never approves a write by itself, and never lets one through without a decision", async () => {
    const calls: ProposedCall[] = [RETURN, CLOSE, OUTSIDE];
    for (const { id } of REQUESTS) {
      for (const call of calls) {
        const status = await gate(call, session(id));
        const decided =
          status === "user-approval" ||
          (typeof status === "object" && status !== null && status.type === "denied");
        expect(decided, `${id} ${call.toolName}`).toBe(true);
      }
    }
  });
});

describe("the writes' execute", () => {
  it("applies an approved write to the conversation's sandbox and reports what changed", async () => {
    const current = session();
    const result = (await TOOLS.authorizeReturn.execute!(
      RETURN.input,
      options(current, RETURN.toolCallId),
    )) as WriteResult;

    expect(result).toEqual({
      request: { id: "r01", status: "done", code: "return-authorized" },
      order: orderOf(current.sandbox, "AO-10468"),
    });
    expect(orderOf(current.sandbox, "AO-10468")?.returnAuthorization).toBeDefined();
  });

  it("closes a request with no order to report", async () => {
    const current = session("r14");
    const result = await TOOLS.closeRequest.execute!(
      CLOSE.input,
      options(current, CLOSE.toolCallId),
    );
    expect(result).toEqual({ request: { id: "r14", status: "manual", code: "no-tool" } });
  });

  // One write at a time (spec §4.2): approved calls of one continuation run together, and each
  // execute checks again against what the one before it left.
  it("refuses a second write on the same sandbox: a tool error, never a silent change", async () => {
    const current = session();
    await TOOLS.authorizeReturn.execute!(RETURN.input, options(current, RETURN.toolCallId));
    await expect(
      Promise.resolve().then(() =>
        TOOLS.closeRequest.execute!(CLOSE.input, options(current, CLOSE.toolCallId)),
      ),
    ).rejects.toThrow(SandboxDenied);
    expect(current.sandbox.request).toMatchObject({ status: "done", code: "return-authorized" });
  });
});

/** Every state a chip shows. */
const STATES: readonly ToolState[] = [
  "running",
  "awaiting-approval",
  "done",
  "error",
  "denied",
  "interrupted",
];

describe("tool labels (spec §4.1, W-P22)", () => {
  // The shell's chip names a tool the project does not name as "Tool: <name>" (template spec
  // §5.10): every tool the project offers gets words of its own, in both languages.
  it.each(LOCALES)("gives every tool a label of its own in %s", (locale) => {
    const t = messages[locale];
    for (const name of Object.keys(TOOLS)) {
      const view = { id: "call-1", name, input: {}, state: "done" as const };
      expect(toolLabel(view, t), name).not.toBe(format(t.toolCall.generic, { name }));
    }
  });

  // The chip puts its state's words after the label, so the label names the call and claims
  // nothing about it; the pt-BR nouns are feminine, to agree with "Negada" and "Não concluída".
  it.each(STATES)("names a write %s by its order, however the model wrote it", (state) => {
    const ret = { id: "c", name: "authorizeReturn", input: { orderId: "ao 10468" }, state };
    const change = { id: "c", name: "changeItem", input: { orderId: "AO-10583" }, state };
    expect(toolLabel(ret, messages.en)).toBe("Return authorization: AO-10468");
    expect(toolLabel(ret, messages["pt-BR"])).toBe("Autorização de devolução AO-10468");
    expect(toolLabel(change, messages.en)).toBe("Order change: AO-10583");
    expect(toolLabel(change, messages["pt-BR"])).toBe("Alteração do pedido AO-10583");
  });

  it("names a read and a decision by their request once the output holds it", () => {
    const output = { request: { id: "r06" } };
    const read = { id: "c", name: "readRequest", input: {}, output, state: "done" as const };
    const close = { id: "c", name: "closeRequest", input: {}, output, state: "done" as const };
    expect(toolLabel(read, messages.en)).toBe("Request lookup: r06");
    expect(toolLabel(read, messages["pt-BR"])).toBe("Consulta da solicitação r06");
    expect(toolLabel(close, messages.en)).toBe("Request decision: r06");
    expect(toolLabel(close, messages["pt-BR"])).toBe("Decisão da solicitação r06");
  });

  // While the input streams, or before an output, the id may not be there yet.
  it.each([
    ["readRequest", {}, "Request lookup", "Consulta da solicitação"],
    ["authorizeReturn", { orderId: " " }, "Return authorization", "Autorização de devolução"],
    ["changeItem", undefined, "Order change", "Alteração do pedido"],
    ["closeRequest", { outcome: "declined" }, "Request decision", "Decisão da solicitação"],
  ])("labels a %s call with no id yet by its noun alone", (name, input, en, pt) => {
    const view = { id: "c", name, input, state: "awaiting-approval" as const };
    expect(toolLabel(view, messages.en)).toBe(en);
    expect(toolLabel(view, messages["pt-BR"])).toBe(pt);
  });
});

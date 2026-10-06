import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { SandboxDenied } from "@/lib/sandbox/sandbox";
import { callItems } from "./tool-calls";

// What P2's renderer shows for each tool call of an answer (P2's spec §1 item 3, §4.4): the
// shell's chip for each call, except a write that waits for the person, which shows as the
// approval card; and under a decided write, its result line: applied with the person's approval,
// rejected by the person, or blocked by the policy gate, with its code when the stream gave one.
// It reads the parts as AI SDK 7.0.114 leaves them (ai dist/index.d.ts, UIToolInvocation).

type Part = UIMessage["parts"][number];
const INPUT = { orderId: "AO-10468", reason: "Doesn't fit." };
const write = (part: Record<string, unknown>): Part =>
  ({
    type: "tool-authorizeReturn",
    toolCallId: "call-2",
    input: INPUT,
    ...part,
  }) as unknown as Part;
const read: Part = {
  type: "tool-readRequest",
  toolCallId: "call-1",
  state: "output-available",
  input: {},
  output: { request: { id: "r01" } },
} as unknown as Part;
const answer = (...parts: Part[]): UIMessage => ({
  id: "a1",
  role: "assistant",
  parts: [{ type: "step-start" }, ...parts],
});

describe("callItems", () => {
  it("shows a read as its chip, with no card and no result line", () => {
    const [item] = callItems(answer(read));
    expect(item.view).toMatchObject({ id: "call-1", name: "readRequest", state: "done" });
    expect(item.card).toBeNull();
    expect(item.outcome).toBeNull();
  });

  it("shows a write that waits for the person as a card, with its approval id and its call", () => {
    const items = callItems(
      answer(
        read,
        { type: "step-start" },
        write({ state: "approval-requested", approval: { id: "ap-1" } }),
      ),
    );
    expect(items.map(({ view }) => view.id)).toEqual(["call-1", "call-2"]);
    expect(items[1].view.state).toBe("awaiting-approval");
    expect(items[1].card).toEqual({
      approvalId: "ap-1",
      call: { toolCallId: "call-2", toolName: "authorizeReturn", input: INPUT },
    });
    expect(items[1].outcome).toBeNull();
  });

  it("shows no card for a decision the gate took by itself", () => {
    const [item] = callItems(
      answer(write({ state: "approval-requested", approval: { id: "ap-1", isAutomatic: true } })),
    );
    expect(item.card).toBeNull();
  });

  it("says a write ran with the person's approval", () => {
    const [item] = callItems(
      answer(
        write({
          state: "output-available",
          output: { request: { id: "r01" } },
          approval: { id: "ap-1", approved: true },
        }),
      ),
    );
    expect(item.view.state).toBe("done");
    expect(item.outcome).toEqual({ kind: "applied" });
  });

  it("says the person rejected a write, before and after the server records it", () => {
    for (const state of ["approval-responded", "output-denied"]) {
      const [item] = callItems(answer(write({ state, approval: { id: "ap-1", approved: false } })));
      expect(item.view.state).toBe("denied");
      expect(item.outcome).toEqual({ kind: "rejected" });
    }
  });

  it("leaves an approved write that has yet to run without a result line", () => {
    const [item] = callItems(
      answer(write({ state: "approval-responded", approval: { id: "ap-1", approved: true } })),
    );
    expect(item.view.state).toBe("running");
    expect(item.outcome).toBeNull();
  });

  it("says the policy gate blocked a write, with the code it gave", () => {
    const [item] = callItems(
      answer(
        write({
          state: "output-denied",
          approval: { id: "ap-1", approved: false, isAutomatic: true, reason: "outside-window" },
        }),
      ),
    );
    expect(item.card).toBeNull();
    expect(item.outcome).toEqual({ kind: "blocked", code: "outside-window" });
  });

  it("says the gate blocked a write with no code when the stream gave none, or an unknown one", () => {
    // The re-check on a continuation overrides an approval and streams no reason (ai 7.0.114).
    const overridden = write({ state: "output-denied", approval: { id: "ap-1", approved: true } });
    const unknown = write({
      state: "output-denied",
      approval: { id: "ap-1", approved: false, isAutomatic: true, reason: "made-up" },
    });
    for (const part of [overridden, unknown]) {
      expect(callItems(answer(part))[0].outcome).toEqual({ kind: "blocked", code: null });
    }
  });

  it("reads a write the sandbox refused when it ran as blocked, with its code", () => {
    const [item] = callItems(
      answer(
        write({
          state: "output-error",
          errorText: new SandboxDenied("proposal-pending").message,
          approval: { id: "ap-1", approved: true },
        }),
      ),
    );
    expect(item.view.state).toBe("error");
    expect(item.outcome).toEqual({ kind: "blocked", code: "proposal-pending" });
  });

  it("gives a write that failed for another reason no result line: its chip says it failed", () => {
    const [item] = callItems(answer(write({ state: "output-error", errorText: "Couldn't run." })));
    expect(item.outcome).toBeNull();
  });
});

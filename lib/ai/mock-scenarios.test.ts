import { describe, expect, it } from "vitest";
import { READ_TOOL, type ProposedCall } from "@/lib/sandbox/calls";
import { REQUESTS, requestById } from "@/lib/sandbox/requests";
import { apply, check, openSandbox, orderOf } from "@/lib/sandbox/sandbox";
import { storeData } from "@/lib/store/customers";
import { readRequestOutput } from "@/lib/tools";
import { SAMPLE_TOOL_NAME } from "@/lib/sample-tool";
import {
  DENIED_ANSWER,
  FAILED_ANSWER,
  MOCK_PLANS,
  MOCK_SCENARIOS,
  closedAnswer,
  readAnswer,
  writeAnswer,
} from "./mock-scenarios";
import { DEFAULT_MOCK_TEXT, type MockPrompt, type MockTurn } from "./mock-steps";

// P2's mock (spec §4.7, P2-23): "Handle this request." reads the request, then plays its plan,
// the write spec §5 expects; after the write, one sentence; after a denied call, text and no new
// call (W-P11, fixed here, in P2's own file: the shell's step machine reads JSON results only).

const HANDLE = "Handle this request.";
const READ = "Read this request.";

function turn(message: string, prompt: MockPrompt = [], toolCallId = "mock-call-1"): MockTurn {
  return { prompt, message, toolCallId };
}

/** A prompt that ends with the tool message a denied or failed call leaves. */
function endingWith(output: { type: string; [key: string]: unknown }): MockPrompt {
  return [
    { role: "system", content: "Instructions." },
    { role: "user", content: [{ type: "text", text: HANDLE }] },
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "c1", toolName: "authorizeReturn", input: {} }],
    },
    {
      role: "tool",
      content: [{ type: "tool-result", toolCallId: "c1", toolName: "authorizeReturn", output }],
    },
  ] as MockPrompt;
}

// Spec §5's table: where each request ends, and the order an act changes.
const EXPECTED: Record<string, [status: string, code: string]> = {
  r01: ["done", "return-authorized"],
  r02: ["done", "size-changed"],
  r03: ["done", "size-changed"],
  r04: ["answered", "policy-question"],
  r05: ["answered", "policy-question"],
  r06: ["declined", "outside-window"],
  r07: ["declined", "already-returned"],
  r08: ["declined", "already-shipped"],
  r09: ["declined", "already-shipped"],
  r10: ["manual", "carrier-investigation"],
  r11: ["manual", "defect-claim"],
  r12: ["manual", "not-covered"],
  r13: ["manual", "warranty-claim"],
  r14: ["manual", "no-tool"],
  r15: ["declined", "outside-window"],
  r16: ["manual", "no-tool"],
  r17: ["declined", "not-on-account"],
  r18: ["declined", "not-delivered-yet"],
  r19: ["answered", "order-status"],
};

function planCall(id: string): ProposedCall {
  return { toolCallId: "mock-call-2", ...MOCK_PLANS[id] };
}

describe("MOCK_PLANS", () => {
  it("has one plan per request", () => {
    expect(Object.keys(MOCK_PLANS)).toEqual(REQUESTS.map(({ id }) => id));
    expect(Object.keys(EXPECTED)).toEqual(Object.keys(MOCK_PLANS));
  });

  it.each(Object.keys(EXPECTED))(
    "%s: the gate allows the plan, which ends where spec §5 expects",
    (id) => {
      const seed = openSandbox(id);
      expect(check(planCall(id), seed)).toMatchObject({ allowed: true });
      const after = apply(planCall(id), seed);
      expect([after.request.status, after.request.code]).toEqual(EXPECTED[id]);
    },
  );

  it("changes an order only in the three acts, as spec §5 expects", () => {
    expect(
      orderOf(apply(planCall("r01"), openSandbox("r01")), "AO-10468")?.returnAuthorization,
    ).toMatchObject({ refundOnArrival: 149 });
    const jacket = orderOf(apply(planCall("r02"), openSandbox("r02")), "AO-10583")!.items[0];
    expect(jacket.variant).toBe("Men's L, Black");
    const socks = orderOf(apply(planCall("r03"), openSandbox("r03")), "AO-10589")!.items[1];
    expect(socks).toMatchObject({
      name: "Acme Merino Hiking Socks (2-pack)",
      variant: "Women's L",
    });
    for (const id of Object.keys(EXPECTED).filter(
      (each) => !["r01", "r02", "r03"].includes(each),
    )) {
      expect(apply(planCall(id), openSandbox(id)).customers, id).toEqual(storeData.customers);
    }
  });
});

describe("MOCK_SCENARIOS.firstStep", () => {
  it.each([HANDLE, READ, "handle THIS request, please"])("reads the request for %j", (message) => {
    expect(MOCK_SCENARIOS.firstStep(turn(message, [], "mock-call-3"))).toEqual({
      kind: "tool-call",
      toolCallId: "mock-call-3",
      toolName: READ_TOOL,
      input: {},
    });
  });

  it("gives any other message the default answer", () => {
    expect(MOCK_SCENARIOS.firstStep(turn("Tell me something"))).toEqual({
      kind: "text",
      text: DEFAULT_MOCK_TEXT,
    });
  });

  // W-P11: the shell's step machine passes a denial (execution-denied) or a failure (error text)
  // on to firstStep, which would read the request again and repeat the plan.
  it("answers a denied call with text and no new call", () => {
    const denied = endingWith({ type: "execution-denied", reason: "outside-window" });
    expect(MOCK_SCENARIOS.firstStep(turn(HANDLE, denied))).toEqual({
      kind: "text",
      text: DENIED_ANSWER,
    });
  });

  it("answers a failed call with text and no new call", () => {
    const failed = endingWith({ type: "error-text", value: "Denied by the sandbox's policy." });
    expect(MOCK_SCENARIOS.firstStep(turn(HANDLE, failed))).toEqual({
      kind: "text",
      text: FAILED_ANSWER,
    });
  });

  // The template's sample eval (lib/eval/project.ts) asks the model with no instructions, and
  // P2's agent always sends them: the sample's cue never fires in P2's chat.
  it("calls the template sample's tool only for a prompt with no instructions", () => {
    const message = "Is item ITM-0108 available to borrow?";
    const bare: MockPrompt = [{ role: "user", content: [{ type: "text", text: message }] }];
    expect(MOCK_SCENARIOS.firstStep(turn(message, bare))).toMatchObject({
      kind: "tool-call",
      toolName: SAMPLE_TOOL_NAME,
    });
    const agent: MockPrompt = [{ role: "system", content: "Instructions." }, ...bare];
    expect(MOCK_SCENARIOS.firstStep(turn(message, agent))).toEqual({
      kind: "text",
      text: DEFAULT_MOCK_TEXT,
    });
  });
});

describe("MOCK_SCENARIOS.afterTool", () => {
  it.each(Object.keys(EXPECTED))(
    "plays %s's plan after reading it for Handle this request",
    (id) => {
      const reading = readRequestOutput(openSandbox(id));
      expect(
        MOCK_SCENARIOS.afterTool(
          { toolName: READ_TOOL, value: reading },
          turn(HANDLE, [], "mock-call-2"),
        ),
      ).toEqual({ kind: "tool-call", ...planCall(id) });
    },
  );

  it("answers Read this request from the reading, with no write", () => {
    const reading = readRequestOutput(openSandbox("r01"));
    const step = MOCK_SCENARIOS.afterTool({ toolName: READ_TOOL, value: reading }, turn(READ));
    expect(step).toEqual({ kind: "text", text: readAnswer(reading) });
    expect(readAnswer(reading)).toBe(
      "Request r01 is from Sofia Ramirez, who has 3 orders. Ask me to handle it when you are ready.",
    );
  });

  it("proposes nothing on a request a write already closed", () => {
    const sandbox = apply(planCall("r06"), openSandbox("r06"));
    const reading = readRequestOutput(sandbox);
    expect(MOCK_SCENARIOS.afterTool({ toolName: READ_TOOL, value: reading }, turn(HANDLE))).toEqual(
      {
        kind: "text",
        text: closedAnswer(reading),
      },
    );
    expect(closedAnswer(reading)).toBe("Request r06 is already closed: declined (outside-window).");
  });

  it("says in one sentence what a write changed", () => {
    const value = { request: { id: "r01", status: "done", code: "return-authorized" } };
    expect(MOCK_SCENARIOS.afterTool({ toolName: "authorizeReturn", value }, turn(HANDLE))).toEqual({
      kind: "text",
      text: writeAnswer(value),
    });
    expect(writeAnswer(value)).toBe("Applied. Request r01 is now done (return-authorized).");
  });

  it("leaves a result it cannot read to the step machine", () => {
    expect(MOCK_SCENARIOS.afterTool({ toolName: READ_TOOL, value: "text" }, turn(HANDLE))).toBe(
      undefined,
    );
    expect(MOCK_SCENARIOS.afterTool({ toolName: "otherTool", value: {} }, turn(HANDLE))).toBe(
      undefined,
    );
  });

  it("keeps every request's text out of its answers", () => {
    for (const { id } of REQUESTS) {
      const reading = readRequestOutput(openSandbox(id));
      const answer = readAnswer(reading);
      expect(answer).not.toContain(requestById(id).message);
    }
  });
});

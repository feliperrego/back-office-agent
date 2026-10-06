import type { UIMessage } from "ai";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { openSandbox, type Sandbox } from "@/lib/sandbox/sandbox";
import { AgentMessage } from "./agent-message";

// P2's renderer (P2's spec §1 item 3, §4.4, §4.5, P2-21): the answer's text first, then each tool
// call in order, as the shell's chip, except a write waiting for the person, which is the
// approval card; under a decided write, its result line; the caption last. It keeps the renderer
// contract (template spec §5.8): data-message-role="assistant" on the root, the text as its first
// child div, the caption last. The server render reads it in English.

type Part = UIMessage["parts"][number];
const READ = {
  type: "tool-readRequest",
  toolCallId: "call-1",
  state: "output-available",
  input: {},
  output: { request: { id: "r01" } },
} as unknown as Part;
const write = (part: Record<string, unknown>) =>
  ({
    type: "tool-authorizeReturn",
    toolCallId: "call-2",
    input: { orderId: "AO-10468", reason: "Doesn't fit." },
    ...part,
  }) as unknown as Part;
const answer = (parts: Part[], text = ""): UIMessage => ({
  id: "a1",
  role: "assistant",
  parts: [
    { type: "step-start" },
    ...(text === "" ? [] : [{ type: "text" as const, text, state: "done" as const }]),
    ...parts,
  ],
});
const CAPTION = createElement("p", { "data-caption": "" });

function render(
  message: UIMessage,
  {
    canRespond = true,
    sandbox = openSandbox("r01"),
  }: { canRespond?: boolean; sandbox?: Sandbox } = {},
): string {
  return renderToStaticMarkup(
    createElement(
      LocaleProvider,
      null,
      createElement(AgentMessage, {
        message,
        streaming: false,
        caption: CAPTION,
        respond: () => {},
        canRespond,
        sandbox,
      }),
    ),
  );
}

const ROOT = /^<div data-message-role="assistant"[^>]*><div[^>]*>/;

describe("AgentMessage", () => {
  it("keeps the contract: the text first, the calls, the caption last", () => {
    const markup = render(answer([READ], "Request r01 is from Sofia Ramirez."));
    expect(markup).toMatch(ROOT);
    expect(markup).toMatch(/^<div[^>]*><div[^>]*>Request r01 is from Sofia Ramirez\.<\/div><ul/);
    expect(markup).toMatch(/<p data-caption=""><\/p><\/div>$/);
    expect(markup).toContain('data-tool="readRequest" data-tool-state="done"');
  });

  it("shows a write that waits for the person as the card, after the chips, with the store's words", () => {
    const markup = render(
      answer([
        READ,
        { type: "step-start" },
        write({ state: "approval-requested", approval: { id: "ap-1" } }),
      ]),
    );
    expect(markup.indexOf('data-tool="readRequest"')).toBeLessThan(
      markup.indexOf("data-approval-card"),
    );
    // The card stands where the call's chip would, under the same data-tool, so a test or a
    // reader follows one call from card to chip.
    expect(markup).toMatch(
      /data-tool="authorizeReturn" data-tool-state="awaiting-approval"><section[^>]*data-approval-card/,
    );
    for (const text of [
      "Approval needed",
      "Return authorization: AO-10468",
      "Refund due on arrival",
      "$149.00 to the original payment method",
      "Policy check",
      "Needs your judgement",
      "Agent&#x27;s reason",
      ">Approve<",
      ">Reject<",
    ]) {
      expect(markup).toContain(text);
    }
    expect(markup).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>[\s\S]*?Approve/);
  });

  it("holds the card's buttons while no answer can go", () => {
    const markup = render(
      answer([write({ state: "approval-requested", approval: { id: "ap-1" } })]),
      { canRespond: false },
    );
    expect(markup.match(/<button[^>]*\sdisabled=""/g)).toHaveLength(2);
  });

  it.each([
    [
      "applied",
      write({
        state: "output-available",
        output: { request: { id: "r01" } },
        approval: { id: "ap-1", approved: true },
      }),
      "done",
      "Applied · approved by you",
    ],
    [
      "rejected",
      write({ state: "output-denied", approval: { id: "ap-1", approved: false } }),
      "denied",
      "Rejected by you",
    ],
    [
      "blocked",
      write({
        state: "output-denied",
        approval: { id: "ap-1", approved: false, isAutomatic: true, reason: "outside-window" },
      }),
      "denied",
      "Blocked by policy: the order is past its 30-day return window",
    ],
    [
      "blocked with no code",
      write({ state: "output-denied", approval: { id: "ap-1", approved: true } }),
      "denied",
      "Blocked by policy",
    ],
  ])("shows a write that was %s as its chip, then its result line", (_, part, state, line) => {
    const markup = render(answer([part]));
    expect(markup).not.toContain("data-approval-card");
    expect(markup).toMatch(
      new RegExp(
        `data-tool="authorizeReturn" data-tool-state="${state}"[\\s\\S]*<p data-approval-result="[a-z]+"[^>]*>${line}</p>`,
      ),
    );
  });

  it("settles a call that no longer streams as not finished, as the shell's chips do", () => {
    const markup = render(
      answer([write({ state: "approval-responded", approval: { id: "ap-1", approved: true } })]),
    );
    expect(markup).toContain('data-tool-state="interrupted"');
    expect(markup).not.toContain("data-approval-result");
  });
});

import { tool } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MAX_USER_CHARS } from "./config";
import {
  MAX_APPROVAL_REASON_CHARS,
  MAX_ASSISTANT_CHARS,
  MAX_MESSAGES,
  MAX_TOOL_PART_CHARS,
  MAX_TOOL_PARTS,
} from "./limits";
import { VALIDATION_ERRORS, validateAndClean } from "./validate";

// The boundaries come from the constants, not literals: lib/chat/limits.ts is project-owned
// (X-01 design §4.1), and each limit must hold at its value and fail one past it.
//
// P2 changes this shell default on purpose (P2's spec §4.3, P2-20; template spec §5.8, X-02): the
// history keeps the tool parts of the tools the route offers, field by field, with its step-start
// parts in order, so an approval reaches streamText; it is listed for X-03. P2 owns these tests.

/** A read and a write of the shape the route's tools have, so the shell's test needs neither. */
const TOOLS = {
  lookUp: tool({
    inputSchema: z.object({}),
    execute: async () => ({ found: true }),
  }),
  change: tool({
    inputSchema: z.object({ orderId: z.string().min(1) }).strict(),
    execute: async () => ({ changed: true }),
  }),
};

type TestMessage = { id: string; role: string; parts: Record<string, unknown>[] };

let nextId = 0;
function id(prefix: string) {
  nextId += 1;
  return `${prefix}${nextId}`;
}

function user(text: string): TestMessage {
  return { id: id("u"), role: "user", parts: [{ type: "text", text }] };
}

function assistant(...parts: Record<string, unknown>[]): TestMessage {
  return { id: id("a"), role: "assistant", parts };
}

function assistantText(text: string): TestMessage {
  return assistant({ type: "step-start" }, { type: "text", text, state: "done" });
}

/** Alternating user/assistant history of `count` messages that starts with a user message. */
function history(count: number): TestMessage[] {
  return Array.from({ length: count }, (_, i) =>
    i % 2 === 0 ? user(`question ${i}`) : assistantText(`answer ${i}`),
  );
}

const READ = {
  type: "tool-lookUp",
  toolCallId: "call-read",
  state: "output-available",
  input: {},
  output: { found: true },
};
const RAN = {
  type: "tool-change",
  toolCallId: "call-ran",
  state: "output-available",
  input: { orderId: "AO-1" },
  output: { changed: true },
  approval: { id: "approval-ran", approved: true },
};
const CARD = {
  type: "tool-change",
  toolCallId: "call-card",
  state: "approval-requested",
  input: { orderId: "AO-2" },
  approval: { id: "approval-card" },
};
const ANSWERED = {
  ...CARD,
  state: "approval-responded",
  approval: { id: "approval-card", approved: true },
};
const REJECTED = {
  ...CARD,
  state: "approval-responded",
  approval: { id: "approval-card", approved: false, reason: "Keep it." },
};
const GATE_DENIED = {
  type: "tool-change",
  toolCallId: "call-denied",
  state: "output-denied",
  input: { orderId: "AO-3" },
  approval: { id: "approval-denied", isAutomatic: true, approved: false, reason: "not-on-account" },
};

/** Each cleaned message as its role and its parts' types (text parts as their text). */
async function cleaned(messages: unknown, tools: Parameters<typeof validateAndClean>[1] = TOOLS) {
  const result = await validateAndClean({ id: "chat", messages, trigger: "submit-message" }, tools);
  if (!result.ok) throw new Error(`Expected ok, got 400: ${result.text}`);
  return result.messages.map((m) => ({
    role: m.role,
    parts: m.parts.map((p) => (p.type === "text" ? p.text : `<${p.type}>`)),
  }));
}

async function cleanedMessages(messages: unknown) {
  const result = await validateAndClean({ messages }, TOOLS);
  if (!result.ok) throw new Error(`Expected ok, got 400: ${result.text}`);
  return result.messages;
}

describe("validateAndClean — accepts", () => {
  it.each([
    ["a 1-message history", 1],
    ["a history of half the limit", Math.ceil(MAX_MESSAGES / 2)],
    [`a ${MAX_MESSAGES}-message history (the limit)`, MAX_MESSAGES],
  ])("%s", async (_, count) => {
    const result = await validateAndClean({ messages: history(count) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.messages).toHaveLength(count);
  });

  it.each([
    [`a user text of exactly ${MAX_USER_CHARS} characters`, [user("u".repeat(MAX_USER_CHARS))]],
    [
      `an assistant text of exactly ${MAX_ASSISTANT_CHARS} characters`,
      [user("Hi"), assistantText("a".repeat(MAX_ASSISTANT_CHARS)), user("More")],
    ],
    [
      "an assistant message with no parts (dropped while cleaning)",
      [user("Hi"), assistant(), user("Again")],
    ],
    [
      `an assistant message with ${MAX_TOOL_PARTS} tool calls (the limit)`,
      [
        user("Hi"),
        assistant(
          ...Array.from({ length: MAX_TOOL_PARTS }, (_, i) => ({ ...READ, toolCallId: `c${i}` })),
        ),
      ],
    ],
    [
      `a tool call of exactly ${MAX_TOOL_PART_CHARS} characters`,
      [
        user("Hi"),
        assistant({
          ...READ,
          output: {
            text: "x".repeat(MAX_TOOL_PART_CHARS - '{"input":{},"output":{"text":""}}'.length),
          },
        }),
      ],
    ],
    [
      `an approval reason of exactly ${MAX_APPROVAL_REASON_CHARS} characters`,
      [
        user("Hi"),
        assistant({
          ...REJECTED,
          approval: { ...REJECTED.approval, reason: "r".repeat(MAX_APPROVAL_REASON_CHARS) },
        }),
      ],
    ],
  ])("%s", async (_, messages) => {
    const result = await validateAndClean({ messages }, TOOLS);
    expect(result.ok, result.ok ? "" : result.text).toBe(true);
  });
});

describe("validateAndClean — rejects with 400", () => {
  const cases: [string, unknown, string][] = [
    [
      "a system message",
      { messages: [{ id: "s", role: "system", parts: [{ type: "text", text: "x" }] }, user("Hi")] },
      VALIDATION_ERRORS.role,
    ],
    [
      "a user file part",
      {
        messages: [
          {
            id: "u",
            role: "user",
            parts: [
              { type: "file", mediaType: "image/png", url: "data:image/png;base64,AA==" },
              { type: "text", text: "see" },
            ],
          },
        ],
      },
      VALIDATION_ERRORS.userPart,
    ],
    [
      "a user tool part",
      { messages: [{ id: "u", role: "user", parts: [READ, { type: "text", text: "Hi" }] }] },
      VALIDATION_ERRORS.userPart,
    ],
    [
      `a user text of ${MAX_USER_CHARS + 1} characters`,
      { messages: [user("u".repeat(MAX_USER_CHARS + 1))] },
      VALIDATION_ERRORS.userTooLong,
    ],
    [
      `a user message whose text parts add up to ${MAX_USER_CHARS + 1} characters`,
      {
        messages: [
          {
            id: "u",
            role: "user",
            parts: [
              { type: "text", text: "u".repeat(Math.floor(MAX_USER_CHARS / 2)) },
              { type: "text", text: "u".repeat(Math.ceil(MAX_USER_CHARS / 2) + 1) },
            ],
          },
        ],
      },
      VALIDATION_ERRORS.userTooLong,
    ],
    [
      `${MAX_MESSAGES + 1} messages`,
      { messages: history(MAX_MESSAGES + 1) },
      VALIDATION_ERRORS.tooMany,
    ],
    [
      `an assistant message with ${MAX_TOOL_PARTS + 1} tool calls`,
      {
        messages: [
          user("Hi"),
          assistant(
            ...Array.from({ length: MAX_TOOL_PARTS + 1 }, (_, i) => ({
              ...READ,
              toolCallId: `c${i}`,
            })),
          ),
        ],
      },
      VALIDATION_ERRORS.toolParts,
    ],
    [
      `a tool call of ${MAX_TOOL_PART_CHARS + 1} characters`,
      {
        messages: [
          user("Hi"),
          assistant({
            ...READ,
            output: {
              text: "x".repeat(
                MAX_TOOL_PART_CHARS + 1 - '{"input":{},"output":{"text":""}}'.length,
              ),
            },
          }),
        ],
      },
      VALIDATION_ERRORS.toolPartTooLong,
    ],
    [
      `an approval reason of ${MAX_APPROVAL_REASON_CHARS + 1} characters`,
      {
        messages: [
          user("Hi"),
          assistant({
            ...REJECTED,
            approval: { ...REJECTED.approval, reason: "r".repeat(MAX_APPROVAL_REASON_CHARS + 1) },
          }),
        ],
      },
      VALIDATION_ERRORS.approvalReason,
    ],
    [
      "an answered card whose input its tool refuses",
      { messages: [user("Hi"), assistant({ ...ANSWERED, input: { orderId: "AO-2", amount: 1 } })] },
      VALIDATION_ERRORS.toolInput,
    ],
    [
      "a call that ran with an input its tool refuses",
      { messages: [user("Hi"), assistant({ ...RAN, input: { orderId: "" } }), user("More")] },
      VALIDATION_ERRORS.toolInput,
    ],
    // The SDK's own rule: a denied call says approved: false. A server re-check that overrides a
    // person's approval leaves approved: true on the browser's part (ai 7.0.114), which no honest
    // flow reaches, since the pending call passes its own re-check (P2's spec §4.2).
    [
      "a denied call whose approval says approved",
      {
        messages: [
          user("Hi"),
          assistant({ ...GATE_DENIED, approval: { id: "a", approved: true } }),
          user("More"),
        ],
      },
      VALIDATION_ERRORS.shape,
    ],
    ["only assistant messages", { messages: [assistantText("Hello")] }, VALIDATION_ERRORS.noUser],
    ["a body that is not an object", "hello", VALIDATION_ERRORS.shape],
    ["a body that is null", null, VALIDATION_ERRORS.shape],
    ["a body without messages", { id: "chat" }, VALIDATION_ERRORS.shape],
    ["messages that are not an array", { messages: { role: "user" } }, VALIDATION_ERRORS.shape],
    ["an empty messages array", { messages: [] }, VALIDATION_ERRORS.shape],
    [
      "a message without an id",
      { messages: [{ role: "user", parts: [{ type: "text", text: "Hi" }] }] },
      VALIDATION_ERRORS.shape,
    ],
    [
      "an unknown role",
      { messages: [{ id: "x", role: "tool", parts: [{ type: "text", text: "Hi" }] }] },
      VALIDATION_ERRORS.shape,
    ],
    [
      "a user message with no parts",
      { messages: [{ id: "u", role: "user", parts: [] }] },
      VALIDATION_ERRORS.shape,
    ],
    [
      "a text part without text",
      { messages: [{ id: "u", role: "user", parts: [{ type: "text" }] }] },
      VALIDATION_ERRORS.shape,
    ],
    [
      "an unknown part type",
      { messages: [{ id: "u", role: "user", parts: [{ type: "banana", text: "Hi" }] }] },
      VALIDATION_ERRORS.shape,
    ],
  ];

  it.each(cases)("%s", async (_, body, text) => {
    expect(await validateAndClean(body, TOOLS)).toEqual({ ok: false, status: 400, text });
  });

  it(`checks roles before limits: ${MAX_MESSAGES + 1} messages with a system message report the role`, async () => {
    const messages = [
      { id: "s", role: "system", parts: [{ type: "text", text: "x" }] },
      ...history(MAX_MESSAGES),
    ];
    expect(await validateAndClean({ messages })).toMatchObject({ text: VALIDATION_ERRORS.role });
  });

  it("names the limits in its texts", () => {
    expect(VALIDATION_ERRORS.tooMany).toContain(`at most ${MAX_MESSAGES} messages`);
    expect(VALIDATION_ERRORS.userTooLong).toContain(`at most ${MAX_USER_CHARS} characters`);
    expect(VALIDATION_ERRORS.toolParts).toContain(`at most ${MAX_TOOL_PARTS} tool calls`);
    expect(VALIDATION_ERRORS.toolPartTooLong).toContain(
      `at most ${MAX_TOOL_PART_CHARS} characters`,
    );
    expect(VALIDATION_ERRORS.approvalReason).toContain(
      `at most ${MAX_APPROVAL_REASON_CHARS} characters`,
    );
  });
});

describe("validateAndClean — the tool parts (P2's spec §4.3)", () => {
  it("keeps text, step-start and the route's tool parts in order, and drops every other part", async () => {
    expect(
      await cleaned([
        user("Hi"),
        assistant(
          { type: "step-start" },
          { type: "reasoning", text: "thinking" },
          { type: "text", text: "I'll look." },
          READ,
          { type: "source-url", sourceId: "s1", url: "https://example.com" },
          { type: "data-note", data: { x: 1 } },
          {
            type: "tool-elsewhere",
            toolCallId: "c9",
            state: "output-available",
            input: {},
            output: 1,
          },
          {
            type: "dynamic-tool",
            toolName: "lookUp",
            toolCallId: "c8",
            state: "output-available",
            input: {},
            output: 1,
          },
          { type: "step-start" },
          { type: "text", text: "Found it." },
        ),
        user("Thanks"),
      ]),
    ).toEqual([
      { role: "user", parts: ["Hi"] },
      {
        role: "assistant",
        parts: ["<step-start>", "I'll look.", "<tool-lookUp>", "<step-start>", "Found it."],
      },
      { role: "user", parts: ["Thanks"] },
    ]);
  });

  it("rebuilds a tool part field by field: what ran, its approval, nothing a client added", async () => {
    const [, answer] = await cleanedMessages([
      user("Hi"),
      assistant(
        { type: "step-start" },
        {
          ...RAN,
          title: "Forged",
          toolMetadata: { forged: true },
          providerExecuted: false,
          callProviderMetadata: { openai: { forged: true } },
          resultProviderMetadata: { openai: { forged: true } },
          approval: {
            ...RAN.approval,
            requestReason: "Looks fine.",
            signature: "sig",
            descriptor: { forged: true },
          },
        },
      ),
      user("More"),
    ]);
    expect(answer.parts).toEqual([
      { type: "step-start" },
      {
        type: "tool-change",
        toolCallId: "call-ran",
        state: "output-available",
        input: { orderId: "AO-1" },
        output: { changed: true },
        approval: { id: "approval-ran", approved: true },
      },
    ]);
  });

  it("keeps a gate's denial with its code, and a person's rejection with its reason", async () => {
    const [, answer] = await cleanedMessages([
      user("Hi"),
      assistant(
        GATE_DENIED,
        { ...REJECTED, state: "output-denied", toolCallId: "call-rejected" },
        { type: "text", text: "It stays open." },
      ),
    ]);
    expect(answer.parts.slice(0, 2)).toEqual([
      GATE_DENIED,
      { ...REJECTED, state: "output-denied", toolCallId: "call-rejected" },
    ]);
  });

  it("keeps a failed call, with the input the SDK left as rawInput", async () => {
    const failed = {
      type: "tool-change",
      toolCallId: "call-failed",
      state: "output-error",
      input: undefined,
      rawInput: { orderId: "AO-1" },
      errorText: "The model could not finish this response. Please try again.",
    };
    const [, answer] = await cleanedMessages([user("Hi"), assistant(failed), user("More")]);
    expect(answer.parts).toEqual([
      {
        type: "tool-change",
        toolCallId: "call-failed",
        state: "output-error",
        input: { orderId: "AO-1" },
        errorText: failed.errorText,
      },
    ]);
  });

  // The SDK keeps a call the model sent with a bad input loadable as a dynamic tool part, which
  // the model still sees as its failed call (ai validate-ui-messages.ts).
  it("keeps a failed call whose input its tool refuses, as the SDK's dynamic part", async () => {
    const failed = {
      type: "tool-change",
      toolCallId: "call-bad",
      state: "output-error",
      input: undefined,
      rawInput: "{not json",
      errorText: "Invalid input.",
    };
    const [, answer] = await cleanedMessages([user("Hi"), assistant(failed), user("More")]);
    expect(answer.parts).toEqual([
      expect.objectContaining({
        type: "dynamic-tool",
        toolName: "change",
        toolCallId: "call-bad",
        state: "output-error",
        input: "{not json",
      }),
    ]);
  });

  it("keeps the card and its answer in the history's last message", async () => {
    for (const part of [CARD, ANSWERED, REJECTED]) {
      const [, answer] = await cleanedMessages([
        user("Hi"),
        assistant({ type: "step-start" }, part),
      ]);
      expect(answer.parts).toEqual([{ type: "step-start" }, part]);
    }
  });

  // An answer is acted on only in the history's last message, the continuation (ai
  // collect-tool-approvals.ts); anywhere else the SDK never runs it, and an approved call kept
  // there would reach the model with no result. So it is dropped, not refused, and the chat goes
  // on (P2's spec §4.3; a visitor may type after a continuation failed). A person's rejection is
  // the exception, below.
  it.each([
    ["an approval answered", ANSWERED],
    ["a card left unanswered", CARD],
  ])(
    "drops %s outside the history's last message, instead of refusing the request",
    async (_, part) => {
      expect(
        await cleaned([
          user("Hi"),
          assistant({ type: "step-start" }, READ, part, { type: "text", text: "Waiting." }),
          user("Never mind."),
        ]),
      ).toEqual([
        { role: "user", parts: ["Hi"] },
        { role: "assistant", parts: ["<step-start>", "<tool-lookUp>", "Waiting."] },
        { role: "user", parts: ["Never mind."] },
      ]);
    },
  );

  // A rejection whose continuation never came (a Stop, an Esc, a 429, a lost connection) stays
  // approval-responded in the browser, whose fold still counts it. The server keeps it too, as
  // the denial the continuation would have left, so its gate denies every later write as the
  // browser's does (P2's spec §3 B7), and the model sees the call with a denied result.
  it("keeps a person's rejection outside the history's last message, as the denial it became", async () => {
    const messages = await cleanedMessages([
      user("Hi"),
      assistant({ type: "step-start" }, READ, REJECTED),
      user("Handle it again."),
    ]);
    expect(messages.map(({ role }) => role)).toEqual(["user", "assistant", "user"]);
    expect(messages[1].parts).toEqual([
      { type: "step-start" },
      READ,
      { ...REJECTED, state: "output-denied" },
    ]);
  });

  it("keeps a rejection alone in its message, so the message and the rejection stay", async () => {
    expect(await cleaned([user("Hi"), assistant(REJECTED), user("Handle it again.")])).toEqual([
      { role: "user", parts: ["Hi"] },
      { role: "assistant", parts: ["<tool-change>"] },
      { role: "user", parts: ["Handle it again."] },
    ]);
  });

  it("drops calls that never finished: streaming, waiting for their run, or preliminary", async () => {
    expect(
      await cleaned([
        user("Hi"),
        assistant(
          { type: "step-start" },
          { type: "tool-lookUp", toolCallId: "c1", state: "input-streaming", input: {} },
          { type: "tool-lookUp", toolCallId: "c2", state: "input-available", input: {} },
          { ...READ, toolCallId: "c3", preliminary: true },
          READ,
        ),
      ]),
    ).toEqual([
      { role: "user", parts: ["Hi"] },
      { role: "assistant", parts: ["<step-start>", "<tool-lookUp>"] },
    ]);
  });

  it("keeps an assistant turn that holds tool calls and no text", async () => {
    expect(
      await cleaned([user("Hi"), assistant({ type: "step-start" }, READ), user("And?")]),
    ).toEqual([
      { role: "user", parts: ["Hi"] },
      { role: "assistant", parts: ["<step-start>", "<tool-lookUp>"] },
      { role: "user", parts: ["And?"] },
    ]);
  });

  it("keeps text and step-starts only, for a route with no tools", async () => {
    expect(
      await cleaned(
        [user("Hi"), assistant({ type: "step-start" }, READ, { type: "text", text: "Yes." })],
        {},
      ),
    ).toEqual([
      { role: "user", parts: ["Hi"] },
      { role: "assistant", parts: ["<step-start>", "Yes."] },
    ]);
  });
});

describe("validateAndClean — text", () => {
  it.each([
    ["an empty assistant text", assistantText("")],
    ["a whitespace-only assistant text", assistantText("  \n ")],
    ["an assistant message with no parts", assistant()],
    ["an assistant message with only step-starts", assistant({ type: "step-start" })],
    ["an assistant message whose only call never finished", assistant(CARD)],
  ])("drops %s and merges the user messages around it", async (_, empty) => {
    expect(await cleaned([user("First"), empty, user("Second")])).toEqual([
      { role: "user", parts: ["First\n\nSecond"] },
    ]);
  });

  it("accepts and merges two consecutive user messages that add up to more than the user limit", async () => {
    // Limits apply to the messages as received, so merging never produces a 400.
    const a = "a".repeat(MAX_USER_CHARS);
    const b = "b".repeat(MAX_USER_CHARS);
    expect(await cleaned([user(a), user(b)])).toEqual([{ role: "user", parts: [`${a}\n\n${b}`] }]);
  });

  // An honest history can carry a longer answer (a mock that ignores the token cap, a model
  // above the limit's characters per token), and the client posts it with every later message.
  it(`cuts an assistant text over ${MAX_ASSISTANT_CHARS} characters to its last ${MAX_ASSISTANT_CHARS}, with no 400`, async () => {
    const head = "h".repeat(100);
    const tail = "t".repeat(MAX_ASSISTANT_CHARS);
    expect(await cleaned([user("Hi"), assistantText(head + tail), user("More")])).toEqual([
      { role: "user", parts: ["Hi"] },
      { role: "assistant", parts: ["<step-start>", tail] },
      { role: "user", parts: ["More"] },
    ]);
  });

  it("cuts the texts of an answer's steps together, keeping their end and every tool part", async () => {
    const first = "f".repeat(100);
    const second = "s".repeat(MAX_ASSISTANT_CHARS - 10);
    expect(
      await cleaned([
        user("Hi"),
        assistant(
          { type: "step-start" },
          { type: "text", text: first },
          READ,
          { type: "step-start" },
          { type: "text", text: second },
        ),
      ]),
    ).toEqual([
      { role: "user", parts: ["Hi"] },
      {
        role: "assistant",
        parts: ["<step-start>", "f".repeat(10), "<tool-lookUp>", "<step-start>", second],
      },
    ]);
  });

  it("never starts the cut on the second half of a surrogate pair", async () => {
    // "😀" is two UTF-16 code units; the cut point falls between them.
    const text = "😀" + "t".repeat(MAX_ASSISTANT_CHARS - 1);
    const [, answer] = await cleaned([user("Hi"), assistantText(text), user("More")]);
    expect(answer.parts).toEqual(["<step-start>", "t".repeat(MAX_ASSISTANT_CHARS - 1)]);
  });

  it("merges three consecutive user messages into one, in order", async () => {
    expect(await cleaned([user("one"), user("two"), user("three")])).toEqual([
      { role: "user", parts: ["one\n\ntwo\n\nthree"] },
    ]);
  });

  it("keeps the first merged message's id", async () => {
    const first = user("one");
    const result = await validateAndClean({ messages: [first, user("two")] });
    expect(result.ok && result.messages[0].id).toBe(first.id);
  });

  it("rebuilds messages with only id, role and their kept parts", async () => {
    const result = await validateAndClean({
      messages: [
        {
          id: "u1",
          role: "user",
          metadata: { forged: true },
          parts: [
            {
              type: "text",
              text: "Hi",
              providerMetadata: { anthropic: { cacheControl: { type: "ephemeral" } } },
            },
          ],
        },
        {
          id: "a1",
          role: "assistant",
          metadata: { forged: true },
          parts: [
            { type: "step-start" },
            { type: "text", text: "Hello.", state: "done", providerMetadata: { openai: {} } },
          ],
        },
      ],
    });
    expect(result).toEqual({
      ok: true,
      messages: [
        { id: "u1", role: "user", parts: [{ type: "text", text: "Hi" }] },
        {
          id: "a1",
          role: "assistant",
          parts: [{ type: "step-start" }, { type: "text", text: "Hello." }],
        },
      ],
    });
  });
});

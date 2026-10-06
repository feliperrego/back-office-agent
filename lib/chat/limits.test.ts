import { describe, expect, it } from "vitest";
import { MAX_OUTPUT_TOKENS, MAX_STEPS } from "@/lib/ai/limits";
import { REQUESTS } from "@/lib/sandbox/requests";
import { openSandbox } from "@/lib/sandbox/sandbox";
import { readRequestOutput } from "@/lib/tools";
import {
  MAX_APPROVAL_REASON_CHARS,
  MAX_ASSISTANT_CHARS,
  MAX_MESSAGES,
  MAX_TOOL_PART_CHARS,
  MAX_TOOL_PARTS,
} from "./limits";

// MAX_ASSISTANT_CHARS is sized from the token cap of lib/ai/limits.ts (template spec §5.8). An
// English token averages about 4 characters, so an honest answer that reaches MAX_OUTPUT_TOKENS
// fits in 4 characters per token. The upper bound keeps the cap near that answer, so a forged
// history cannot carry much more input than an honest one: the template's 6000 for 1024 tokens
// is about 5.9 per token.
const MIN_CHARS_PER_TOKEN = 4;
const MAX_CHARS_PER_TOKEN = 6;

/** The longest readRequest output over every request, as the history carries it. */
const LONGEST_READING = Math.max(
  ...REQUESTS.map(
    ({ id }) => JSON.stringify({ input: {}, output: readRequestOutput(openSandbox(id)) }).length,
  ),
);

describe("lib/chat/limits", () => {
  it("are positive integers", () => {
    for (const value of [
      MAX_MESSAGES,
      MAX_ASSISTANT_CHARS,
      MAX_TOOL_PARTS,
      MAX_TOOL_PART_CHARS,
      MAX_APPROVAL_REASON_CHARS,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  it("fit an honest answer at the token cap in MAX_ASSISTANT_CHARS", () => {
    expect(MAX_ASSISTANT_CHARS).toBeGreaterThanOrEqual(MAX_OUTPUT_TOKENS * MIN_CHARS_PER_TOKEN);
  });

  it("keep MAX_ASSISTANT_CHARS near that answer, so a forged history stays small", () => {
    expect(MAX_ASSISTANT_CHARS).toBeLessThanOrEqual(MAX_OUTPUT_TOKENS * MAX_CHARS_PER_TOKEN);
  });

  // P2's spec §4.8: an assistant message spans a proposal and its continuation, two requests of
  // at most MAX_STEPS model calls each; the cap allows two calls per model call.
  it("fit every tool call of an honest answer in MAX_TOOL_PARTS", () => {
    expect(MAX_TOOL_PARTS).toBe(2 * MAX_STEPS * 2);
  });

  // An honest tool call carries either a server-made output (readRequest's is the longest) or an
  // input the model wrote, at most a whole answer at the token cap.
  it("fit the longest honest tool call in MAX_TOOL_PART_CHARS, and not much more", () => {
    expect(LONGEST_READING).toBeGreaterThan(1000);
    expect(MAX_TOOL_PART_CHARS).toBeGreaterThanOrEqual(LONGEST_READING);
    expect(MAX_TOOL_PART_CHARS).toBeGreaterThanOrEqual(MAX_OUTPUT_TOKENS * MAX_CHARS_PER_TOKEN);
    expect(MAX_TOOL_PART_CHARS).toBeLessThanOrEqual(
      2 * Math.max(LONGEST_READING, MAX_OUTPUT_TOKENS * MAX_CHARS_PER_TOKEN),
    );
  });

  // The gate's reasons are codes, and the chat sends no reason of its own (P2's spec §4.4).
  it("leave room for an approval's reason the size of a write's reason", () => {
    expect(MAX_APPROVAL_REASON_CHARS).toBe(300);
  });
});

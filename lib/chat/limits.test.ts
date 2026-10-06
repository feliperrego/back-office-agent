import { describe, expect, it } from "vitest";
import { MAX_OUTPUT_TOKENS } from "@/lib/ai/limits";
import { MAX_ASSISTANT_CHARS, MAX_MESSAGES } from "./limits";

// MAX_ASSISTANT_CHARS is sized from the token cap of lib/ai/limits.ts (template spec §5.8). An
// English token averages about 4 characters, so an honest answer that reaches MAX_OUTPUT_TOKENS
// fits in 4 characters per token. The upper bound keeps the cap near that answer, so a forged
// history cannot carry much more input than an honest one: the template's 6000 for 1024 tokens
// is about 5.9 per token.
const MIN_CHARS_PER_TOKEN = 4;
const MAX_CHARS_PER_TOKEN = 6;

describe("lib/chat/limits", () => {
  it("are positive integers", () => {
    for (const value of [MAX_MESSAGES, MAX_ASSISTANT_CHARS]) {
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
});

import { describe, expect, it } from "vitest";
import { MAX_OUTPUT_TOKENS, MAX_STEPS } from "./limits";

// The model-call limits live outside lib/chat/, so a project that removes the chat keeps them
// (template spec §5.1, §9 step 6b). Project-owned: a project sets its own values.

describe("lib/ai/limits", () => {
  it("are positive integers", () => {
    for (const value of [MAX_OUTPUT_TOKENS, MAX_STEPS]) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  // One step calls the tool and the next one answers with its result.
  it("leave room for a tool call and the answer after it", () => {
    expect(MAX_STEPS).toBeGreaterThanOrEqual(2);
  });
});

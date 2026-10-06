import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("vercel.json", () => {
  // Without it, req.signal never fires on Vercel, so Stop would not end the chat route's model
  // call (template spec §5.1).
  it("turns on request cancellation for the chat route", () => {
    expect(JSON.parse(readFileSync("vercel.json", "utf8"))).toEqual({
      functions: { "app/api/chat/route.ts": { supportsCancellation: true } },
    });
  });
});

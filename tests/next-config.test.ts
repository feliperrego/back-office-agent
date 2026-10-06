import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";
import { HELP_CENTER_DIR, readHelpCenter } from "@/lib/help-center/articles";

// The agent's instructions read the help-center articles from disk when the chat route loads
// (lib/chat/instructions.ts, P2's spec §3, P2-16). Locally every file is there; on Vercel the
// route's function holds only what its trace names, so the trace must name the articles.
describe("next.config.ts", () => {
  it("traces every help-center article into the chat route", () => {
    expect(nextConfig.outputFileTracingIncludes).toEqual({
      "/api/chat": [`./${HELP_CENTER_DIR}/*.md`],
    });
    expect(readHelpCenter().every(({ file }) => file.endsWith(".md"))).toBe(true);
  });
});

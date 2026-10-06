import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The agent's instructions read P1's help-center articles from disk when the chat route loads
  // (lib/chat/instructions.ts, P2's spec §3, P2-16), so the route's server trace must carry them.
  outputFileTracingIncludes: {
    "/api/chat": ["./content/help-center/*.md"],
  },
};

export default nextConfig;

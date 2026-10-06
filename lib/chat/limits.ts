/**
 * The chat's limits (X-01 design §4.2). Project-owned: each project sets them in its own spec
 * (template spec §5.1). The client and the route's validation read them from here. The model
 * call's output cap is not a chat limit: it lives in lib/ai/limits.ts, which a project without
 * the chat keeps (template spec §9 step 6b). Pure and client-safe.
 */

/**
 * Most messages in one conversation, counted as the raw messages.length. The client stops at it
 * and the route rejects one more (X-01 design §4.3).
 */
export const MAX_MESSAGES = 20;

/**
 * Longest assistant text the route passes back to the model, in characters; a longer one is cut
 * to its end (lib/chat/validate.ts). Sized from MAX_OUTPUT_TOKENS in lib/ai/limits.ts: an honest
 * answer at the token cap usually fits, and a forged history cannot carry much more
 * (limits.test.ts ties the two).
 */
export const MAX_ASSISTANT_CHARS = 6000;

/**
 * Most tool calls one assistant message may carry; the route rejects one more (P2's spec §4.3).
 * A message spans a proposal and its continuation (P2's spec §4.8): two requests of at most
 * MAX_STEPS model calls each, at up to two calls per model call.
 */
export const MAX_TOOL_PARTS = 20;

/**
 * Longest tool call the history may carry, in characters of its input, output and error as JSON;
 * the route rejects a longer one (P2's spec §4.3). Sized from the longest readRequest output and
 * from a model's input at the token cap (limits.test.ts ties them), so a forged history cannot
 * carry much more than an honest one.
 */
export const MAX_TOOL_PART_CHARS = 8000;

/**
 * Longest reason an approval may carry: the gate's are codes, and the chat sends a person's
 * answer with none (P2's spec §4.4); the route rejects a longer one.
 */
export const MAX_APPROVAL_REASON_CHARS = 300;

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

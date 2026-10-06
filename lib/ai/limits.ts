/**
 * The model-call limits (template spec §5.1). Project-owned: each project sets them in its own
 * spec. Every streamText or generateText call reads them from here, chat or not, so a project that
 * removes the chat (template spec §9 step 6b) keeps its cap. The chat's own limits live in
 * lib/chat/limits.ts, which that step deletes with the chat. Pure and client-safe.
 */

/** Output cap of every model call: the cost bound of one call (template spec §5.1). */
export const MAX_OUTPUT_TOKENS = 1024;

/**
 * Most model calls in one request, for a model that calls tools over several steps
 * (stopWhen: isStepCount(MAX_STEPS)): a tool call takes one, and the answer after its result
 * another. A call waiting for a person's approval ends the request, and the continuation after
 * the answer is a request of its own, with MAX_STEPS again (P2's spec §4.8; ai stream-text.ts).
 * So with MAX_OUTPUT_TOKENS per call, one answer's output stays under (approvals + 1) times
 * MAX_STEPS times the cap.
 */
export const MAX_STEPS = 5;

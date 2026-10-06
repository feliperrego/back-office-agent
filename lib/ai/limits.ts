/**
 * The model-call limits (template spec §5.1). Project-owned: each project sets them in its own
 * spec. Every streamText or generateText call reads them from here, chat or not, so a project that
 * removes the chat (template spec §9 step 6b) keeps its cap. The chat's own limits live in
 * lib/chat/limits.ts, which that step deletes with the chat. Pure and client-safe.
 */

/** Output cap of every model call: the cost bound of one call (template spec §5.1). */
export const MAX_OUTPUT_TOKENS = 1024;

/**
 * Most model calls in one answer, for a model that calls tools over several steps
 * (stopWhen: isStepCount(MAX_STEPS)): a tool call takes one, and the answer after its result
 * another. With MAX_OUTPUT_TOKENS per call, one answer's output stays under MAX_STEPS times the
 * cap.
 */
export const MAX_STEPS = 5;

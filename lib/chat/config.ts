/**
 * Chat settings owned by the shell (X-01 design §4.1, §4.2), shared by the client and the server.
 * The limits a project sets for itself live in ./limits. Keep this module free of server-only
 * imports: client components import it.
 */

/** Longest user message, in characters. The composer's maxLength matches it. */
export const MAX_USER_CHARS = 2000;

/** streamText timeout until the first content chunk. */
export const FIRST_CHUNK_TIMEOUT_MS = 20_000;

/** streamText timeout between content chunks. */
export const CHUNK_TIMEOUT_MS = 15_000;

/** Autoscroll keeps following while the view is at most this far from the bottom. */
export const SCROLL_THRESHOLD_PX = 80;

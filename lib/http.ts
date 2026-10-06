import { rateLimit, rateLimitResponse } from "./rate-limit";

const UNSUPPORTED_MEDIA_TYPE_TEXT = "Invalid request: Content-Type must be application/json.";

/** The Content-Type media type, lower-cased and stripped of parameters (e.g. `; charset=utf-8`). */
function mediaType(req: Request): string {
  return (req.headers.get("Content-Type") ?? "").split(";", 1)[0].trim().toLowerCase();
}

/**
 * True for `application/json`, with or without parameters, in any case. A JSON Content-Type
 * is not CORS-safelisted, so a cross-site page cannot send one without a preflight (template
 * spec §5.7).
 */
export function isJsonRequest(req: Request): boolean {
  return mediaType(req) === "application/json";
}

export function unsupportedMediaTypeResponse(): Response {
  return new Response(UNSUPPORTED_MEDIA_TYPE_TEXT, {
    status: 415,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Call first in every route that calls a model (template spec §5.7, §5.3, §9 step 6):
 *
 *   const blocked = await guardModelRoute(req);
 *   if (blocked) return blocked;
 *
 * Runs the rate limit (429), then the Content-Type check (415), and never reads the body.
 * Because the rate limit runs first, a rejected request still uses one of the visitor's
 * hourly requests; what the 415 saves is the model call, i.e. the AI Gateway spend.
 */
export async function guardModelRoute(req: Request): Promise<Response | null> {
  const limited = await rateLimit(req);
  if (!limited.ok) return rateLimitResponse(limited);
  if (!isJsonRequest(req)) return unsupportedMediaTypeResponse();
  return null;
}

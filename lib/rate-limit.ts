import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { ipAddress } from "@vercel/functions";
import { PROJECT_SLUG } from "@/lib/project";

/**
 * Per-IP limit for public demos (template spec §5.3). Off when the Upstash env vars
 * are missing or empty (local dev, CI). Fails open on Redis errors: the
 * AI Gateway spend cap is the backstop.
 */
const DEFAULT_LIMIT_PER_HOUR = 20;

function readLimitPerHour(): number {
  const raw = process.env.RATE_LIMIT_PER_HOUR?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_LIMIT_PER_HOUR;
  const value = Number(raw);
  return value > 0 ? value : DEFAULT_LIMIT_PER_HOUR;
}

export const RATE_LIMIT_PER_HOUR = readLimitPerHour();

// The REST pair only. The integration also injects KV_URL and REDIS_URL, which
// @upstash/redis never reads (template spec §5.3).
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const RATE_LIMIT_ENABLED = Boolean(redisUrl && redisToken);

// Demos sharing one Upstash database keep separate counters (template spec §5.3). The prefix
// follows the project's identity in lib/project.ts (X-01 design §4.2).
export const RATE_LIMIT_PREFIX = PROJECT_SLUG;

const limiter = RATE_LIMIT_ENABLED
  ? new Ratelimit({
      redis: new Redis({ url: redisUrl, token: redisToken }),
      limiter: Ratelimit.slidingWindow(RATE_LIMIT_PER_HOUR, "1 h"),
      prefix: RATE_LIMIT_PREFIX,
    })
  : null;

if (!limiter) {
  console.info("[rate-limit] Upstash env vars are not set; rate limiting is off.");
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds?: number };

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return ipAddress(req) || forwarded || "unknown";
}

/**
 * Routes that call a model use guardModelRoute (lib/http.ts), which calls this first and then
 * rejects non-JSON bodies with 415 (template spec §5.3, §5.7). Because this runs first, a
 * request the 415 rejects still counts against the hourly limit; the 415 saves the model call
 * (the AI Gateway spend), not the visitor's hourly budget.
 */
export async function rateLimit(req: Request): Promise<RateLimitResult> {
  if (!limiter) return { ok: true };

  try {
    // analytics is off, so `pending` is an already-resolved promise.
    const { success, reset } = await limiter.limit(clientIp(req));
    if (success) return { ok: true };

    const seconds = Math.ceil((reset - Date.now()) / 1000);
    return Number.isFinite(seconds)
      ? { ok: false, retryAfterSeconds: Math.max(1, seconds) }
      : { ok: false };
  } catch (error) {
    console.error("[rate-limit] Upstash request failed; allowing the request.", error);
    return { ok: true };
  }
}

export function rateLimitResponse(result: {
  ok: false;
  retryAfterSeconds?: number;
}): Response {
  const headers = new Headers({ "Content-Type": "text/plain; charset=utf-8" });
  if (result.retryAfterSeconds !== undefined) {
    headers.set("Retry-After", String(result.retryAfterSeconds));
  }
  return new Response(
    `Demo limit reached: ${RATE_LIMIT_PER_HOUR} messages per hour. Try again later.`,
    { status: 429, headers },
  );
}

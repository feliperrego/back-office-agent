import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above imports, so shared state comes from vi.hoisted.
const h = vi.hoisted(() => ({
  rateLimitResult: { ok: true } as { ok: true } | { ok: false; retryAfterSeconds?: number },
  rateLimitCalls: [] as Request[],
}));

// Real rateLimitResponse, controlled rateLimit.
vi.mock("./rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./rate-limit")>();
  return {
    ...actual,
    rateLimit: async (req: Request) => {
      h.rateLimitCalls.push(req);
      return h.rateLimitResult;
    },
  };
});

const UNSUPPORTED_TEXT = "Invalid request: Content-Type must be application/json.";
const BODY = JSON.stringify({ messages: [{ role: "user", content: "Hi" }] });

async function loadHttp() {
  for (const name of [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "RATE_LIMIT_PER_HOUR",
  ]) {
    vi.stubEnv(name, "");
  }
  return import("./http");
}

function post(contentType?: string): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: contentType === undefined ? {} : { "Content-Type": contentType },
    body: contentType === undefined ? undefined : BODY,
  });
}

beforeEach(() => {
  vi.resetModules();
  h.rateLimitResult = { ok: true };
  h.rateLimitCalls = [];
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isJsonRequest", () => {
  it("accepts application/json with or without parameters, in any case", async () => {
    const { isJsonRequest } = await loadHttp();
    expect(isJsonRequest(post("application/json"))).toBe(true);
    expect(isJsonRequest(post("application/json; charset=utf-8"))).toBe(true);
    expect(isJsonRequest(post("Application/JSON"))).toBe(true);
  });

  it("rejects the content types a cross-site form can send without a CORS preflight", async () => {
    const { isJsonRequest } = await loadHttp();
    expect(isJsonRequest(post("text/plain"))).toBe(false);
    expect(isJsonRequest(post("application/x-www-form-urlencoded"))).toBe(false);
    expect(isJsonRequest(post("multipart/form-data; boundary=x"))).toBe(false);
  });

  it("rejects a request with no Content-Type, and look-alike JSON types", async () => {
    const { isJsonRequest } = await loadHttp();
    expect(isJsonRequest(post())).toBe(false);
    expect(isJsonRequest(post("application/json-patch+json"))).toBe(false);
  });
});

describe("unsupportedMediaTypeResponse", () => {
  it("returns a 415 text/plain with the fixed text", async () => {
    const { unsupportedMediaTypeResponse } = await loadHttp();
    const res = unsupportedMediaTypeResponse();
    expect(res.status).toBe(415);
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe(UNSUPPORTED_TEXT);
  });
});

describe("guardModelRoute", () => {
  it("returns 415 for a text/plain POST and never reads the body", async () => {
    const { guardModelRoute } = await loadHttp();
    const req = post("text/plain");

    const res = await guardModelRoute(req);

    expect(res?.status).toBe(415);
    expect(res?.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await res?.text()).toBe(UNSUPPORTED_TEXT);
    expect(req.bodyUsed).toBe(false);
  });

  it("returns 415 when the request has no Content-Type header", async () => {
    const { guardModelRoute } = await loadHttp();
    const res = await guardModelRoute(post());
    expect(res?.status).toBe(415);
  });

  it.each(["application/json", "application/json; charset=utf-8", "Application/JSON"])(
    "returns null for %s, so the route goes on, without reading the body",
    async (contentType) => {
      const { guardModelRoute } = await loadHttp();
      const req = post(contentType);
      expect(await guardModelRoute(req)).toBeNull();
      expect(req.bodyUsed).toBe(false);
    },
  );

  it("returns the 429 before checking the Content-Type", async () => {
    const { guardModelRoute } = await loadHttp();
    h.rateLimitResult = { ok: false, retryAfterSeconds: 30 };
    const req = post("text/plain");

    const res = await guardModelRoute(req);

    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBe("30");
    expect(await res?.text()).toBe("Demo limit reached: 20 messages per hour. Try again later.");
    expect(req.bodyUsed).toBe(false);
  });

  it("rate-limits first, so a request the 415 rejects still counts against the limit", async () => {
    const { guardModelRoute } = await loadHttp();
    const req = post("text/plain");

    await guardModelRoute(req);

    expect(h.rateLimitCalls).toEqual([req]);
  });
});

import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai";
import { MAX_OUTPUT_TOKENS, MAX_STEPS } from "@/lib/ai/limits";
import { getModel } from "@/lib/ai/model";
import { CHUNK_TIMEOUT_MS, FIRST_CHUNK_TIMEOUT_MS } from "@/lib/chat/config";
import { toSafeErrorMessage } from "@/lib/chat/errors";
import { buildInstructions } from "@/lib/chat/instructions";
import { validateAndClean } from "@/lib/chat/validate";
import { guardModelRoute } from "@/lib/http";
import { requestLocale } from "@/lib/i18n/locale";
import { TOOLS } from "@/lib/tools";

// Node.js runtime (the Next.js default; no `runtime` export). Vercel request cancellation needs
// it and `supportsCancellation` in vercel.json (template spec §5.1).
export const maxDuration = 60;

function badRequest(text: string): Response {
  return new Response(text, {
    status: 400,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(req: Request): Promise<Response> {
  // 1–2. Rate limit (429), then 415 for a non-JSON body, before the body is read
  // (template spec §5.7).
  const blocked = await guardModelRoute(req);
  if (blocked) return blocked;

  // 3. Parse.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request: the body must be JSON.");
  }

  // 4. Validate and clean the history (X-01 design §4.2). An invalid or missing locale is
  // ignored, never a 400.
  const validated = await validateAndClean(body);
  if (!validated.ok) return badRequest(validated.text);
  const locale = requestLocale(body);

  // 5. Stream, with the project's tools (template spec §5.10), for at most MAX_STEPS model calls
  // (template spec §5.1).
  const result = streamText({
    model: getModel(),
    instructions: buildInstructions({ locale }),
    messages: await convertToModelMessages(validated.messages),
    tools: TOOLS,
    stopWhen: isStepCount(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    reasoning: "none",
    abortSignal: req.signal,
    timeout: { firstChunkMs: FIRST_CHUNK_TIMEOUT_MS, chunkMs: CHUNK_TIMEOUT_MS },
    // Suppresses streamText's own console.error(error) default: the error is already
    // logged once by toSafeErrorMessage in toUIMessageStream's onError below.
    onError: () => {},
  });

  // 6. Respond with the UI message stream as SSE.
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools: TOOLS,
      onError: toSafeErrorMessage,
      sendReasoning: false,
    }),
  });
}

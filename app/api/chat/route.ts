import { createUIMessageStreamResponse } from "ai";
import { streamAgentReply } from "@/lib/agent/pipeline";
import { getModel } from "@/lib/ai/model";
import { validateAndClean } from "@/lib/chat/validate";
import { guardModelRoute } from "@/lib/http";
import { requestLocale } from "@/lib/i18n/locale";
import { REQUEST_ID_ERROR, requestIdOf } from "@/lib/sandbox/requests";
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

/**
 * The agent panel's route (P2's spec §4.3). Every POST counts against the visitor's hourly limit:
 * a first message, a continuation after an approval or a rejection, a Retry (P2's spec §4.8).
 */
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

  // 4. Validate and clean the history, keeping the tool parts of P2's tools (P2's spec §4.3).
  // The request must be one of the demo's, so the model never chooses one; an invalid or missing
  // locale is ignored, never a 400.
  const validated = await validateAndClean(body, TOOLS);
  if (!validated.ok) return badRequest(validated.text);
  const requestId = requestIdOf(body);
  if (requestId === null) return badRequest(REQUEST_ID_ERROR);
  const locale = requestLocale(body);

  // 5. Stream the agent's answer (lib/agent/pipeline.ts).
  const { stream } = await streamAgentReply({
    model: getModel(),
    messages: validated.messages,
    requestId,
    locale,
    abortSignal: req.signal,
  });
  return createUIMessageStreamResponse({ stream });
}

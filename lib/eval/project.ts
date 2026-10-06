import { isStepCount, type LanguageModel, streamText, toUIMessageStream } from "ai";
import { MAX_OUTPUT_TOKENS, MAX_STEPS } from "@/lib/ai/limits";
import { format } from "@/lib/i18n/format";
import { localized } from "@/lib/i18n/localized";
import { messages } from "@/lib/i18n/messages";
import { TOOLS } from "@/lib/tools";
import { messageText } from "@/lib/trace/message-text";
import { toolViewsOf } from "@/lib/trace/tool-view";
import { type Check, traceMetadataOf, traceMetadataOnFinish } from "@/lib/trace/trace";
import type { CaseOutcome, EvalCase, EvalProject, Score, TracedResult } from "./record";
import { collectUIMessage } from "./run";
import type { EvalsPage } from "./view";

/**
 * The project's eval (template spec §5.11): its cases, how one runs, how its answer scores, and
 * README line 1's sentence. Project-owned: a project replaces the sample with its own cases
 * (measurements/cases.json, frozen before its first run), its runCase and its scorer, and keeps
 * the EVAL_PROJECT export, which `pnpm eval` reads (scripts/eval.ts), and EVALS_PAGE, which the
 * Evals pages read (template spec §5.12). Server-only.
 *
 * The template's eval is a sample to replace: three cases asked once each to the model with the
 * sample tool of lib/tools.ts, scored by the tools the answer called and the phrases its reply
 * holds. A chat project runs each case through its chat's own pipeline instead (its instructions,
 * tools and limits), so the eval measures what a visitor gets. The sample calls the model
 * directly, with no import from lib/chat/, so it survives the removal recipe of a project without
 * a chat (template spec §9 step 6b).
 */

export type SampleCase = EvalCase & {
  /** The case's one user message. */
  message: string;
  /** A correct answer calls exactly these tools, in order, and its reply holds every phrase. */
  expected: { tools: string[]; replyMentions: string[] };
};

/** What the run records of one answer. */
export type SampleResult = TracedResult & {
  message: string;
  /** All the answer's text, each step's a blank line apart, as the chat shows it (messageText). */
  reply: string;
  finishReason: string | null;
};

/** The checks every answer is scored by, in order: the screens label each one. */
export const CHECK_IDS = ["tool-calls", "reply-mentions"] as const;
export type CheckId = (typeof CHECK_IDS)[number];

function check(id: CheckId, ok: boolean, detail: string[]): Check {
  return ok || detail.length === 0 ? { id, ok } : { id, ok, detail };
}

async function runCase(
  evalCase: SampleCase,
  { model }: { model: LanguageModel },
): Promise<CaseOutcome<SampleResult>> {
  const result = streamText({
    model,
    messages: [{ role: "user", content: evalCase.message }],
    tools: TOOLS,
    stopWhen: isStepCount(MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    reasoning: "none",
    // The failure reaches the run through the stream's error chunk (collectUIMessage).
    onError: () => {},
  });
  const outcome = await collectUIMessage(
    toUIMessageStream({
      stream: result.stream,
      tools: TOOLS,
      // The answer's tokens, as the trace reads them (template spec §5.10).
      messageMetadata: traceMetadataOnFinish(performance.now()),
      // The script's operator reads the model's own error; no visitor sees it.
      onError: (error) => (error instanceof Error ? error.message : String(error)),
      sendReasoning: false,
    }),
  );
  if ("abortReason" in outcome) return outcome;
  const { message, finishReason } = outcome;
  return {
    result: {
      message: evalCase.message,
      reply: messageText(message),
      toolCalls: toolViewsOf(message),
      usage: traceMetadataOf(message).usage,
      finishReason,
    },
  };
}

function score({ expected }: SampleCase, { reply, toolCalls }: SampleResult): Score {
  const called = toolCalls.map(({ name }) => name);
  const toolsOk =
    called.length === expected.tools.length &&
    called.every((name, i) => name === expected.tools[i]);
  const missing = expected.replyMentions.filter(
    (phrase) => !reply.toLowerCase().includes(phrase.toLowerCase()),
  );
  const checks = [
    check("tool-calls", toolsOk, called),
    check("reply-mentions", missing.length === 0, missing),
  ];
  const pass = checks.every(({ ok }) => ok);
  return { pass, tally: { passed: pass ? 1 : 0, total: 1 }, checks };
}

export const EVAL_PROJECT: EvalProject<SampleCase, SampleResult> = {
  runCase,
  score,
  // The Evals page's English sentence (evalText.headline), so README line 1 and the page agree.
  headline: (numbers) => format(messages.en.evalText.headline, numbers),
  // Nothing in a mock answer of the sample changes from run to run.
  volatileKeys: [],
};

/**
 * The sample's words and links on the Evals pages (template spec §5.12), from the project's
 * dictionary (evalText in lib/i18n/messages.ts) in every language: the headline sentence, how a
 * case is scored, the groups' and the checks' labels, and each case's page at /evals/<id>, which
 * shows the case's question and its recorded reply.
 */
export const EVALS_PAGE: EvalsPage<SampleResult> = {
  headline: localized((t) => t.evalText.headline),
  about: localized((t) => t.evalText.about),
  groupLabel: (group) => localized((t) => t.evalText.groups[group]),
  checkLabel: (id) => localized((t) => t.evalText.checks[id]),
  evalsHref: "/evals",
  caseHref: (id) => `/evals/${id}`,
  exchange: ({ message, reply }) => ({ question: message, answer: reply }),
};

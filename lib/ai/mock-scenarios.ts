import { SAMPLE_TOOL_NAME } from "@/lib/tools";
import { DEFAULT_MOCK_TEXT, type MockScenarios } from "./mock-steps";

/**
 * The project's mock scenarios (template spec §5.2): the cues the mock reads in a user message and
 * the answers it gives, so CI and Preview never call a model. Project-owned: a project replaces
 * the cues and answers with its own and keeps the MOCK_SCENARIOS export, which lib/ai/mock.ts
 * reads. The step machine and the shell's [[slow]] and [[error]] live in lib/ai/mock-steps.ts.
 * Nothing here imports lib/chat/, so the mock survives the removal recipe of a non-chat project
 * (template spec §9 step 6b).
 *
 * The template's scenarios are samples to replace: a message that names an item id gets a call to
 * the sample tool of lib/tools.ts, then an answer from its result; any other message gets the
 * default answer.
 */

/** A sample item id: "ITM-" and four digits, such as ITM-0042, in any case. */
const ITEM_ID = /\bITM-(\d{4})\b/i;

/** The item id a message names, in upper case, or null when it names none. */
export function itemIdOf(text: string): string | null {
  const match = ITEM_ID.exec(text);
  return match === null ? null : `ITM-${match[1]}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The mock's answer to a sample tool result, which reads { found: true, item: { id, name,
 * status } } or { found: false, itemId }: the item and its status, or that it was not found.
 */
export function itemAnswer(lookup: unknown): string {
  if (!isRecord(lookup) || lookup.found !== true || !isRecord(lookup.item)) {
    const id =
      isRecord(lookup) && typeof lookup.itemId === "string" ? `item ${lookup.itemId}` : "that item";
    return `I couldn't find ${id}. Please check the item id.`;
  }
  const { id, name, status } = lookup.item;
  return `Item ${String(id)} (${String(name)}) is ${String(status)}.`;
}

/** The template's cues and answers, which the step machine of lib/ai/mock-steps.ts runs. */
export const MOCK_SCENARIOS: MockScenarios = {
  firstStep({ message, toolCallId }) {
    const itemId = itemIdOf(message);
    if (itemId === null) return { kind: "text", text: DEFAULT_MOCK_TEXT };
    return { kind: "tool-call", toolCallId, toolName: SAMPLE_TOOL_NAME, input: { itemId } };
  },
  afterTool({ toolName, value }) {
    return toolName === SAMPLE_TOOL_NAME ? { kind: "text", text: itemAnswer(value) } : undefined;
  },
};

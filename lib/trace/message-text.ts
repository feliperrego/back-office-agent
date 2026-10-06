import type { UIMessage } from "ai";

/**
 * A message's text as the screens show it (template spec §5.10), and as the chat route sends it
 * to the model. Each model call of an answer is a step, which starts with a step-start part and
 * streams its own text parts: a step's parts join as they are, as the SDK joins a step's text,
 * and the steps that hold text read a blank line apart, so a sentence before a tool call and the
 * answer after it never run together. Other parts are skipped. A message with no step-start, such
 * as a user's, is one step. The live chat and a recorded answer read it the same way, so a
 * recorded answer shows what a live one shows. Pure and client-safe.
 */
export function messageText(message: UIMessage): string {
  const steps: string[] = [""];
  for (const part of message.parts) {
    if (part.type === "step-start") steps.push("");
    else if (part.type === "text") steps[steps.length - 1] += part.text;
  }
  return steps.filter((text) => text !== "").join("\n\n");
}

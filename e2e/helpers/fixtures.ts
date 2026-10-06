// The project's text as the chat e2e sees it (X-01 design §4.1, §6). Project-owned: a project
// that changes its strings, its mock answer or its hourly limit edits this file, and the shell's
// specs keep working. The values are literals, not reads of the dictionary, so a rewording fails
// the e2e instead of moving with it.

/**
 * The route where the chat fills the page, which the chat specs open. Their helpers search the
 * whole page, so it holds the chat alone: a project whose "/" is another page, with the chat in a
 * panel there, points this at its full-page chat route (template spec §5.8).
 */
export const CHAT_PATH = "/";

/** The suggested prompts of lib/i18n/messages.ts, in order. */
export const PROMPTS_EN = [
  "Explain streaming in one paragraph.",
  "What can you help me with?",
  "Write a haiku about testing.",
  "List three benefits of small projects.",
] as const;
export const PROMPTS_PT = [
  "Explique streaming em um parágrafo.",
  "Em que você pode me ajudar?",
  "Escreva um haicai sobre testes.",
  "Liste três vantagens de projetos pequenos.",
] as const;

/** The empty state's title and subtitle (empty.title, empty.subtitle). */
export const EMPTY_EN = {
  title: "Chat with the model",
  subtitle: "Starting point: replace this text, the prompts and the instructions.",
} as const;
export const EMPTY_PT = {
  title: "Converse com o modelo",
  subtitle: "Ponto de partida: troque este texto, os prompts e as instruções.",
} as const;

/**
 * The mock's default answer (DEFAULT_MOCK_TEXT in lib/ai/mock-steps.ts), from its first to its
 * last words.
 */
export const FULL_DEFAULT_ANSWER =
  /^Streaming lets an answer appear [\s\S]* keeps every test run predictable\.$/;

/**
 * A message that makes the mock call the project's tool (lib/ai/mock-scenarios.ts, lib/tools.ts),
 * and what the chat then shows: the tool's name (data-tool), the chip's label in both languages,
 * a line of the call's input and of its output as their JSON shows them, and the answer the mock
 * gives from the result (template spec §5.10).
 */
export const TOOL_PROMPT = "What is the status of item ITM-0042?";
export const TOOL_NAME = "lookUpItem";
export const TOOL_LABEL_EN = "Item lookup: ITM-0042";
export const TOOL_LABEL_PT = "Consulta do item ITM-0042";
export const TOOL_INPUT_TEXT = '"itemId": "ITM-0042"';
export const TOOL_OUTPUT_TEXT = '"name": "Brass desk lamp"';
export const TOOL_ANSWER = "Item ITM-0042 (Brass desk lamp) is available.";

// The texts that carry the hourly limit, with RATE_LIMIT_PER_HOUR pinned to 20 in
// playwright.config.ts. LIMIT_TEXT_EN is also what rateLimitResponse() sends (template spec §5.3).
export const LIMIT_TEXT_EN = "Demo limit reached: 20 messages per hour. Try again later.";
export const LIMIT_TEXT_PT = "Limite da demo atingido: 20 mensagens por hora. Tente mais tarde.";
export const RATE_NOTE_EN = "20 messages/hour per visitor; regenerations count";
export const RATE_NOTE_PT = "20 mensagens/hora por visitante; regenerações contam";

// The project's text as the chat e2e sees it (X-01 design §4.1, §6). Project-owned: a project
// that changes its strings, its mock answer or its hourly limit edits this file, and the shell's
// specs keep working. The values are literals, not reads of the dictionary, so a rewording fails
// the e2e instead of moving with it.

/**
 * The route where the chat fills the page, which the chat specs open. Their helpers search the
 * whole page, so it holds the chat alone: a project whose "/" is another page, with the chat in a
 * panel there, points this at its full-page chat route (template spec §5.8). P2's is the first
 * request's page (P2's spec §4.7).
 */
export const CHAT_PATH = "/requests/r01";

/**
 * The suggested prompts of lib/i18n/messages.ts, in order: an operator's questions about the
 * request, which the mock answers with its default text (P2's spec §1 item 2).
 */
export const PROMPTS_EN = [
  "What does the customer ask for?",
  "Which policy applies here?",
  "What can you change for this customer?",
  "What do you check before proposing a change?",
] as const;
export const PROMPTS_PT = [
  "O que o cliente pede?",
  "Qual política se aplica aqui?",
  "O que você pode alterar para este cliente?",
  "O que você verifica antes de propor uma alteração?",
] as const;

/** The agent panel's empty state: its title and subtitle (empty.title, empty.subtitle). */
export const EMPTY_EN = {
  title: "Work on this request with the agent",
  subtitle:
    "Press Handle this request: the agent reads the request, then proposes one action on a card, and nothing changes until you approve it. Each approval or rejection sends one more message, so approvals count toward the hourly limit.",
} as const;
export const EMPTY_PT = {
  title: "Trabalhe nesta solicitação com o agente",
  subtitle:
    "Use Tratar esta solicitação: o agente lê a solicitação e propõe uma ação num cartão, e nada muda até você aprovar. Cada aprovação ou rejeição envia mais uma mensagem, então aprovações contam no limite por hora.",
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
 * gives from the result (template spec §5.10). P2's read: readRequest takes no input, and reads
 * the request of CHAT_PATH (P2's spec §4.1, §4.7); it needs no approval, so no card shows.
 */
export const TOOL_PROMPT = "Read this request.";
export const TOOL_NAME = "readRequest";
export const TOOL_LABEL_EN = "Request lookup: r01";
export const TOOL_LABEL_PT = "Consulta da solicitação r01";
export const TOOL_INPUT_TEXT = "{}";
export const TOOL_OUTPUT_TEXT = '"name": "Sofia Ramirez"';
export const TOOL_ANSWER =
  "Request r01 is from Sofia Ramirez, who has 3 orders. Ask me to handle it when you are ready.";

/**
 * The request page's button, which sends its message as the person's (P2's spec §1 item 2), and
 * the line above the read-only composer while a card waits (spec §4.5), in each language.
 */
export const HANDLE_EN = "Handle this request";
export const HANDLE_PT = "Tratar esta solicitação";
export const HANDLE_MESSAGE_EN = "Handle this request.";
export const WAITING_EN = "Approve or reject the card above";
export const WAITING_PT = "Aprove ou rejeite o cartão acima";

// The texts that carry the hourly limit, with RATE_LIMIT_PER_HOUR pinned to 20 in
// playwright.config.ts. LIMIT_TEXT_EN is also what rateLimitResponse() sends (template spec §5.3).
export const LIMIT_TEXT_EN = "Demo limit reached: 20 messages per hour. Try again later.";
export const LIMIT_TEXT_PT = "Limite da demo atingido: 20 mensagens por hora. Tente mais tarde.";
export const RATE_NOTE_EN = "20 messages/hour per visitor; regenerations count";
export const RATE_NOTE_PT = "20 mensagens/hora por visitante; regenerações contam";

import { stringField, type ToolView } from "@/lib/trace/tool-view";
import { format } from "./format";
import type { Locale } from "./locale";
import { shellMessages, type ShellMessages } from "./shell-messages";

/**
 * The project's own strings (X-01 design §4.4). Project-owned: replace the defaults and add the
 * keys the project needs. A top-level key must not also be a shell key (see `messages` below).
 */
export type ProjectMessages = {
  empty: { title: string; subtitle: string };
  /** The suggested prompts; each button sends its text as the prompt. */
  prompts: readonly string[];
  /**
   * Each of the project's tools as its chip names it (toolLabel below). The chip adds the call's
   * state after the label ("Working", "Waiting for approval", "The tool failed", "Denied", "Not
   * finished"), so a label must read correctly next to every one of them: it names the call, as
   * a noun, and never says what the call did. `lookUpItemWithId` adds the item, `{id}`, once the
   * input has streamed it; until then the chip shows `lookUpItem`.
   */
  toolLabels: { lookUpItem: string; lookUpItemWithId: string };
  /**
   * The project's words in the app shell (app/(shell)/layout.tsx, template spec §5.12): the nav
   * item of the home page, the tagline under the product name, and the banner on every page.
   */
  site: { home: string; tagline: string; banner: string };
  /**
   * The eval's words on the Evals pages (EVALS_PAGE in lib/eval/project.ts): README line 1's
   * sentence, with `{rate}` and `{cases}`, how a case is scored, and a label for each group of
   * measurements/cases.json and each check of the scorer, by id.
   */
  evalText: {
    headline: string;
    about: string;
    groups: Record<string, string>;
    checks: Record<string, string>;
  };
};

/** One locale's strings: the shell's and the project's. `{name}` marks where format() inserts a value. */
export type Messages = ShellMessages & ProjectMessages;

export const projectMessages: Record<Locale, ProjectMessages> = {
  en: {
    empty: {
      title: "Chat with the model",
      subtitle: "Starting point: replace this text, the prompts and the instructions.",
    },
    prompts: [
      "Explain streaming in one paragraph.",
      "What can you help me with?",
      "Write a haiku about testing.",
      "List three benefits of small projects.",
    ],
    toolLabels: { lookUpItem: "Item lookup", lookUpItemWithId: "Item lookup: {id}" },
    site: {
      home: "Chat",
      tagline: "Sample pages to replace",
      banner:
        "The template's sample: these cases, this run and the items the sample tool looks up are placeholders that a project replaces.",
    },
    evalText: {
      headline: "{rate}% of {cases} frozen sample cases passed",
      about:
        "Each frozen case is asked once to the model, with the sample tool, and scored by a script: the tools its answer called and the phrases its reply holds. No LLM judges the answers.",
      groups: { lookup: "Item lookup", general: "General question" },
      checks: {
        "tool-calls": "Called exactly the expected tools",
        "reply-mentions": "Holds every expected phrase",
      },
    },
  },
  "pt-BR": {
    empty: {
      title: "Converse com o modelo",
      subtitle: "Ponto de partida: troque este texto, os prompts e as instruções.",
    },
    prompts: [
      "Explique streaming em um parágrafo.",
      "Em que você pode me ajudar?",
      "Escreva um haicai sobre testes.",
      "Liste três vantagens de projetos pequenos.",
    ],
    toolLabels: { lookUpItem: "Consulta de item", lookUpItemWithId: "Consulta do item {id}" },
    site: {
      home: "Chat",
      tagline: "Páginas de exemplo para substituir",
      banner:
        "Exemplo do template: estes casos, esta rodada e os itens que a ferramenta de exemplo consulta são provisórios, e cada projeto os substitui.",
    },
    evalText: {
      headline: "{rate}% de {cases} casos de exemplo congelados passaram",
      about:
        "Cada caso congelado é perguntado uma vez ao modelo, com a ferramenta de exemplo, e pontuado por um script: as ferramentas que a resposta chamou e as frases que ela contém. Nenhum LLM julga as respostas.",
      groups: { lookup: "Consulta de item", general: "Pergunta geral" },
      checks: {
        "tool-calls": "Chamou exatamente as ferramentas esperadas",
        "reply-mentions": "Contém todas as frases esperadas",
      },
    },
  },
};

/**
 * Every visible and accessible interface string, in English and pt-BR. The shell and the project
 * share no top-level key: with one in common, the project's spread would replace the whole shell
 * object (X-01 design §4.4). messages.test.ts checks it. Pure and client-safe.
 */
export const messages: Record<Locale, Messages> = {
  en: { ...shellMessages.en, ...projectMessages.en },
  "pt-BR": { ...shellMessages["pt-BR"], ...projectMessages["pt-BR"] },
};

/**
 * A tool call's name in the interface language: the label of its chip, which reads correctly
 * next to every state the chip adds (template spec §5.10). Project-owned: a project names each
 * of its tools (lib/tools.ts) here, from its own keys, and keeps this export, which the shell's
 * chips read. A tool it does not name gets the shell's "Tool: {name}". The input may still be
 * streaming, so a field it reads may be missing or empty: the label then leaves it out.
 */
export function toolLabel(view: ToolView, t: Messages): string {
  switch (view.name) {
    case "lookUpItem": {
      const id = stringField(view.input, "itemId")?.trim() ?? "";
      return id === "" ? t.toolLabels.lookUpItem : format(t.toolLabels.lookUpItemWithId, { id });
    }
    default:
      return format(t.toolCall.generic, { name: view.name });
  }
}

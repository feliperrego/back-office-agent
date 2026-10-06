import { normalizeOrderId } from "@/lib/sandbox/calls";
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
   * a noun, and never says what the call did (W-P22), and in pt-BR a feminine noun, to agree with
   * "Negada" and "Não concluída". A write's label adds its order, `{order}`, once the input has
   * streamed it; readRequest's and closeRequest's add the request, `{id}`, once their output holds
   * it (P2's spec §4.1). `lookUpItem` is the template sample eval's tool (lib/sample-tool.ts),
   * labelled until P2's eval replaces that sample.
   */
  toolLabels: {
    readRequest: string;
    readRequestWithId: string;
    authorizeReturn: string;
    authorizeReturnWithOrder: string;
    changeItem: string;
    changeItemWithOrder: string;
    closeRequest: string;
    closeRequestWithId: string;
    lookUpItem: string;
    lookUpItemWithId: string;
  };
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
    toolLabels: {
      readRequest: "Request lookup",
      readRequestWithId: "Request lookup: {id}",
      authorizeReturn: "Return authorization",
      authorizeReturnWithOrder: "Return authorization: {order}",
      changeItem: "Order change",
      changeItemWithOrder: "Order change: {order}",
      closeRequest: "Request decision",
      closeRequestWithId: "Request decision: {id}",
      lookUpItem: "Item lookup",
      lookUpItemWithId: "Item lookup: {id}",
    },
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
    toolLabels: {
      readRequest: "Consulta da solicitação",
      readRequestWithId: "Consulta da solicitação {id}",
      authorizeReturn: "Autorização de devolução",
      authorizeReturnWithOrder: "Autorização de devolução {order}",
      changeItem: "Alteração do pedido",
      changeItemWithOrder: "Alteração do pedido {order}",
      closeRequest: "Decisão da solicitação",
      closeRequestWithId: "Decisão da solicitação {id}",
      lookUpItem: "Consulta de item",
      lookUpItemWithId: "Consulta do item {id}",
    },
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
  const labels = t.toolLabels;
  switch (view.name) {
    case "readRequest":
      return withField(labels.readRequest, labels.readRequestWithId, { id: requestIdIn(view) });
    case "authorizeReturn":
      return withField(labels.authorizeReturn, labels.authorizeReturnWithOrder, {
        order: orderIdIn(view),
      });
    case "changeItem":
      return withField(labels.changeItem, labels.changeItemWithOrder, { order: orderIdIn(view) });
    case "closeRequest":
      return withField(labels.closeRequest, labels.closeRequestWithId, { id: requestIdIn(view) });
    case "lookUpItem": {
      const id = stringField(view.input, "itemId")?.trim() ?? "";
      return id === "" ? labels.lookUpItem : format(labels.lookUpItemWithId, { id });
    }
    default:
      return format(t.toolCall.generic, { name: view.name });
  }
}

/** The label with its field, or the noun alone while the field is missing or empty. */
function withField(noun: string, withValue: string, field: Record<string, string>): string {
  return Object.values(field).every((value) => value !== "") ? format(withValue, field) : noun;
}

/** A write's order, as the store writes it, however the model wrote it ("ao 10468"). */
function orderIdIn(view: ToolView): string {
  const written = stringField(view.input, "orderId")?.trim() ?? "";
  return written === "" ? "" : normalizeOrderId(written);
}

/** The request a read's or a decision's output names, once it has one. */
function requestIdIn(view: ToolView): string {
  const output = view.output;
  const request =
    typeof output === "object" && output !== null && "request" in output
      ? (output as { request: unknown }).request
      : undefined;
  return stringField(request, "id")?.trim() ?? "";
}

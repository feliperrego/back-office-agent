import { describe, expect, it } from "vitest";
import { format } from "./format";
import { LOCALES, type Locale } from "./locale";
import { messages, projectMessages } from "./messages";
import { shellMessages } from "./shell-messages";

// The approved shell text (X-01 design §4.4; the tool chips and the trace, template spec §5.10;
// the app shell and the Evals pages, template spec §5.12), as literals, so a rewording fails here
// instead of moving with the dictionary. `{n}` and `{name}` stand where a component inserts a
// value. This file reads no project key by name, so it holds in
// any project that keeps the shell.
const APPROVED_SHELL: Record<Locale, Record<string, Record<string, string>>> = {
  en: {
    header: { mockBadge: "Mock model", newChat: "New chat", language: "Language" },
    composer: {
      label: "Message",
      placeholder: "Send a message",
      capNotice: "Conversation limit reached. Start a new chat.",
      send: "Send message",
      stop: "Stop generating",
    },
    list: {
      label: "Conversation",
      stopped: "Stopped",
      cutOff: "Cut at demo length limit",
      regenerate: "Regenerate",
      stoppedBefore: "Stopped before a response ·",
    },
    chat: {
      jump: "Jump to latest",
      retry: "Retry",
      rateNote: "{n} messages/hour per visitor; regenerations count",
    },
    errors: {
      generic: "Couldn't get a response. Check your connection and try again.",
      limit: "Demo limit reached: {n} messages per hour. Try again later.",
    },
    status: {
      complete: "Response complete",
      stopped: "Response stopped",
      failed: "Response failed",
    },
    footer: { builtBy: "Built by", source: "Source on GitHub" },
    toolCall: {
      generic: "Tool: {name}",
      running: "Working",
      awaitingApproval: "Waiting for approval",
      failed: "The tool failed",
      denied: "Denied",
      interrupted: "Not finished",
      input: "Input",
      output: "Output",
      error: "Error",
    },
    trace: {
      toolCalls: "Tool calls",
      noToolCalls: "No tool was called.",
      usage: "Tokens",
      inputTokens: "Input",
      outputTokens: "Output",
      totalTokens: "Total",
      latency: "Latency",
      seconds: "{n} s",
      notReported: "not reported",
      result: "Result",
      why: "Why",
      checkHolds: "(holds)",
      checkFails: "(does not hold)",
      pass: "Passed",
      fail: "Failed",
    },
    appShell: {
      navLabel: "Pages",
      openNav: "Open the navigation",
      navTitle: "Navigation",
      navDescription: "The pages of this site",
    },
    run: {
      label: "Last eval run",
      recorded: "Recorded {date}",
      model: "model {model}",
      commit: "commit {commit}",
      dirty: "(with local changes)",
      mock: "Mock run",
      mockNote: "A mock run shows the format, never a measurement: the real run replaces it.",
    },
    evals: {
      title: "Evals",
      mockHeadline:
        "Mock run: {passed} of {cases} mock answers passed the grader. No measurement yet.",
      interval: "{level}% CI {low}–{high}%",
      intervalWilson: "{level}% CI {low}–{high}% (Wilson score)",
      passed: "{passed} of {cases} cases passed",
      byGroup: "By group",
      ofTotal: "{n} of {total}",
      supporting: "Supporting data",
      medianLatency: "Median latency",
      slowest: "Slowest case",
      medianTokens: "Median tokens per case",
      allTokens: "Tokens over the run",
      cases: "Cases",
      case: "Case",
      group: "Group",
      open: "Open case {id}",
      details: "Run details",
      date: "Date",
      model: "Model",
      commit: "Commit",
      caseSet: "Case set",
      frozen: "{n} cases, frozen on {date}",
      sha256: "SHA-256 {hash}",
      method: "Interval",
      methodValue: "Percentile bootstrap over cases: {resamples} resamples, seed {seed}",
      methodWilson:
        "Wilson score interval over cases: every case scored the same, so the bootstrap's resamples did not vary",
      rawData: "Raw data",
      caseTitle: "Case {id}",
      allCases: "All cases",
      question: "Question",
      answer: "Answer",
      mockUsage: "A mock run measures no tokens and no latency.",
    },
  },
  "pt-BR": {
    header: { mockBadge: "Modelo simulado", newChat: "Nova conversa", language: "Idioma" },
    composer: {
      label: "Mensagem",
      placeholder: "Envie uma mensagem",
      capNotice: "Limite da conversa atingido. Comece uma nova conversa.",
      send: "Enviar mensagem",
      stop: "Parar geração",
    },
    list: {
      label: "Conversa",
      stopped: "Interrompida",
      cutOff: "Cortada no limite de tamanho da demo",
      regenerate: "Gerar novamente",
      stoppedBefore: "Interrompida antes da resposta ·",
    },
    chat: {
      jump: "Ir para o fim",
      retry: "Tentar de novo",
      rateNote: "{n} mensagens/hora por visitante; regenerações contam",
    },
    errors: {
      generic: "Não foi possível obter uma resposta. Verifique sua conexão e tente de novo.",
      limit: "Limite da demo atingido: {n} mensagens por hora. Tente mais tarde.",
    },
    status: {
      complete: "Resposta concluída",
      stopped: "Resposta interrompida",
      failed: "Falha na resposta",
    },
    footer: { builtBy: "Feito por", source: "Código no GitHub" },
    toolCall: {
      generic: "Ferramenta: {name}",
      running: "Em andamento",
      awaitingApproval: "Aguardando aprovação",
      failed: "A ferramenta falhou",
      denied: "Negada",
      interrupted: "Não concluída",
      input: "Entrada",
      output: "Saída",
      error: "Erro",
    },
    trace: {
      toolCalls: "Chamadas de ferramenta",
      noToolCalls: "Nenhuma ferramenta foi chamada.",
      usage: "Tokens",
      inputTokens: "Entrada",
      outputTokens: "Saída",
      totalTokens: "Total",
      latency: "Latência",
      seconds: "{n} s",
      notReported: "não informado",
      result: "Resultado",
      why: "Por quê",
      checkHolds: "(atendida)",
      checkFails: "(não atendida)",
      pass: "Passou",
      fail: "Falhou",
    },
    appShell: {
      navLabel: "Páginas",
      openNav: "Abrir a navegação",
      navTitle: "Navegação",
      navDescription: "As páginas deste site",
    },
    run: {
      label: "Última rodada de avaliação",
      recorded: "Gravada em {date}",
      model: "modelo {model}",
      commit: "versão {commit}",
      dirty: "(com mudanças locais)",
      mock: "Rodada simulada",
      mockNote:
        "Uma rodada simulada mostra o formato, nunca uma medição: a rodada real a substitui.",
    },
    evals: {
      title: "Avaliações",
      mockHeadline:
        "Rodada simulada: {passed} de {cases} respostas simuladas passaram no avaliador. Ainda sem medição.",
      interval: "IC de {level}%: {low}–{high}%",
      intervalWilson: "IC de {level}%: {low}–{high}% (escore de Wilson)",
      passed: "{passed} de {cases} casos passaram",
      byGroup: "Por grupo",
      ofTotal: "{n} de {total}",
      supporting: "Dados de apoio",
      medianLatency: "Latência mediana",
      slowest: "Caso mais lento",
      medianTokens: "Tokens por caso (mediana)",
      allTokens: "Tokens na rodada",
      cases: "Casos",
      case: "Caso",
      group: "Grupo",
      open: "Abrir o caso {id}",
      details: "Detalhes da rodada",
      date: "Data",
      model: "Modelo",
      commit: "Versão",
      caseSet: "Conjunto de casos",
      frozen: "{n} casos, congelados em {date}",
      sha256: "SHA-256 {hash}",
      method: "Intervalo",
      methodValue:
        "Bootstrap de percentis sobre os casos: {resamples} reamostragens, semente {seed}",
      methodWilson:
        "Intervalo de escore de Wilson sobre os casos: todos os casos tiveram o mesmo resultado, então as reamostragens do bootstrap não variaram",
      rawData: "Dados brutos",
      caseTitle: "Caso {id}",
      allCases: "Todos os casos",
      question: "Pergunta",
      answer: "Resposta",
      mockUsage: "Uma rodada simulada não mede tokens nem latência.",
    },
  },
};

/** Every string of a dictionary, keyed by its path, e.g. "status.complete". */
function leaves(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  return Object.entries(value as object).flatMap(([key, child]) =>
    leaves(child, path === "" ? key : `${path}.${key}`),
  );
}

/** The distinct `{name}` placeholders of a string, sorted. */
function placeholders(text: string): string[] {
  return [...new Set(text.match(/\{\w+\}/g))].sort();
}

describe("messages", () => {
  it.each(LOCALES)("has no empty value in %s", (locale) => {
    for (const [path, text] of leaves(messages[locale])) {
      expect(text.trim(), path).not.toBe("");
    }
  });

  it("has the same keys in both locales", () => {
    const keys = (locale: Locale) => leaves(messages[locale]).map(([path]) => path);
    expect(keys("pt-BR")).toEqual(keys("en"));
  });

  it("uses the same placeholders in both locales", () => {
    const pt = new Map(leaves(messages["pt-BR"]));
    for (const [path, text] of leaves(messages.en)) {
      expect(placeholders(pt.get(path) ?? ""), path).toEqual(placeholders(text));
    }
  });

  it.each(LOCALES)("holds exactly the approved shell text in %s", (locale) => {
    expect(shellMessages[locale]).toEqual(APPROVED_SHELL[locale]);
  });

  // A shared top-level key would let the project's spread replace the whole shell object
  // (X-01 design §4.4).
  it.each(LOCALES)("gives the shell and the project no shared top-level key in %s", (locale) => {
    const shared = Object.keys(shellMessages[locale]).filter((key) =>
      Object.hasOwn(projectMessages[locale], key),
    );
    expect(shared).toEqual([]);
  });

  it.each(LOCALES)("composes the shell and the project dictionaries unchanged in %s", (locale) => {
    expect(Object.keys(messages[locale]).sort()).toEqual(
      [...Object.keys(shellMessages[locale]), ...Object.keys(projectMessages[locale])].sort(),
    );
    expect(messages[locale]).toMatchObject(APPROVED_SHELL[locale]);
    expect(messages[locale]).toMatchObject(projectMessages[locale]);
  });
});

describe("format", () => {
  it("fills every {name} placeholder", () => {
    expect(format("Demo limit reached: {n} messages per hour.", { n: 20 })).toBe(
      "Demo limit reached: 20 messages per hour.",
    );
    expect(format("{a} and {b}, then {a}", { a: 1, b: "two" })).toBe("1 and two, then 1");
  });

  it("leaves other text alone", () => {
    expect(format("Stopped before a response ·", { n: 1 })).toBe("Stopped before a response ·");
    expect(format("{m} and { n } stay", { n: 1 })).toBe("{m} and { n } stay");
    // Values go in verbatim: no $ patterns, and no second pass over inserted text.
    expect(format("{n}", { n: "$& {n}" })).toBe("$& {n}");
  });
});

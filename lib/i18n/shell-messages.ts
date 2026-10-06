import type { Locale } from "./locale";

/**
 * One locale's shell strings (X-01 design §4.4): the text of the header, composer, conversation,
 * banners, screen-reader status line and footer, then of the tool chips and the trace
 * (template spec §5.10), and of the app shell and the Evals pages (template spec §5.12). `{n}` and `{name}` mark where format() inserts a value. Shell components
 * read only these keys; project text reaches them through props, and a tool's label through the
 * project's toolLabel (lib/i18n/messages.ts).
 */
export type ShellMessages = {
  header: { mockBadge: string; newChat: string; language: string };
  composer: {
    label: string;
    placeholder: string;
    /**
     * Shown above the composer, and describing it, once the conversation reaches its message cap
     * (template spec §5.8).
     */
    capNotice: string;
    send: string;
    stop: string;
  };
  list: {
    label: string;
    stopped: string;
    cutOff: string;
    regenerate: string;
    /** Ends with the middle dot; the component adds a space before Regenerate. */
    stoppedBefore: string;
  };
  chat: { jump: string; retry: string; rateNote: string };
  errors: { generic: string; limit: string };
  status: { complete: string; stopped: string; failed: string };
  footer: { builtBy: string; source: string };
  /**
   * A tool call's chip (template spec §5.10): the label of a tool the project names no label for,
   * the state of a call that has not simply finished, and the headings of its data.
   */
  toolCall: {
    /** A tool's name, as a label that reads correctly next to every state below. */
    generic: string;
    running: string;
    awaitingApproval: string;
    failed: string;
    denied: string;
    /** A call still running when its answer ended (a Stop, an error, a timeout). */
    interrupted: string;
    input: string;
    output: string;
    error: string;
  };
  /** The trace of an answer (template spec §5.10): its tool calls, tokens, latency and checks. */
  trace: {
    toolCalls: string;
    noToolCalls: string;
    usage: string;
    inputTokens: string;
    outputTokens: string;
    totalTokens: string;
    latency: string;
    seconds: string;
    notReported: string;
    result: string;
    why: string;
    /** Read after a check's label by screen readers; the icon says it on screen. */
    checkHolds: string;
    checkFails: string;
    pass: string;
    fail: string;
  };
  /** The app shell (template spec §5.12): its nav, on a phone a sheet opened from the header. */
  appShell: { navLabel: string; openNav: string; navTitle: string; navDescription: string };
  /** Which eval run a screen shows: dated, with its model and commit, or marked as a mock run. */
  run: {
    label: string;
    recorded: string;
    model: string;
    commit: string;
    dirty: string;
    mock: string;
    mockNote: string;
  };
  /**
   * The Evals page and a case's page (template spec §5.12). A mock run's headline is a statement
   * that it measures nothing, with its pass count and no rate.
   */
  evals: {
    title: string;
    mockHeadline: string;
    interval: string;
    /** The interval when the bootstrap had no spread (lib/eval/stats.ts), labelled. */
    intervalWilson: string;
    passed: string;
    byGroup: string;
    ofTotal: string;
    supporting: string;
    medianLatency: string;
    slowest: string;
    medianTokens: string;
    allTokens: string;
    cases: string;
    case: string;
    group: string;
    open: string;
    details: string;
    date: string;
    model: string;
    commit: string;
    caseSet: string;
    frozen: string;
    sha256: string;
    method: string;
    methodValue: string;
    methodWilson: string;
    rawData: string;
    caseTitle: string;
    allCases: string;
    question: string;
    answer: string;
    mockUsage: string;
  };
};

/**
 * The shell's approved text, in English and pt-BR (X-01 design §4.4). messages.test.ts pins it,
 * so a rewording is a deliberate change to the shell. Pure and client-safe.
 */
export const shellMessages: Record<Locale, ShellMessages> = {
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

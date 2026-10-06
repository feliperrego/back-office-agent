import { normalizeOrderId, type CloseCode } from "@/lib/sandbox/calls";
import type { HandOffReason } from "@/lib/sandbox/requests";
import type { DenialCode, DoneCode, RequestStatus } from "@/lib/sandbox/sandbox";
import type { OrderStatus } from "@/lib/store/customers";
import { stringField, type ToolView } from "@/lib/trace/tool-view";
import { format } from "./format";
import type { Locale } from "./locale";
import { shellMessages, type ShellMessages } from "./shell-messages";

/**
 * The project's own strings (X-01 design §4.4). Project-owned: replace the defaults and add the
 * keys the project needs. A top-level key must not also be a shell key (see `messages` below).
 */
export type ProjectMessages = {
  /** The agent panel's empty state (P2's spec §1); "approvals count" is said here (spec §4.5). */
  empty: { title: string; subtitle: string };
  /**
   * The suggested prompts: an operator's questions about the request, each sent as the prompt.
   * The mock answers them with text and no tool call (tests/api-chat-route.test.ts).
   */
  prompts: readonly string[];
  /**
   * Each of the project's tools as its chip names it (toolLabel below). The chip adds the call's
   * state after the label ("Working", "Waiting for approval", "The tool failed", "Denied", "Not
   * finished"), so a label must read correctly next to every one of them: it names the call, as
   * a noun, and never says what the call did (W-P22), and in pt-BR a feminine noun, to agree with
   * "Negada" and "Não concluída". A write's label adds its order, `{order}`, once the input has
   * streamed it; readRequest's and closeRequest's add the request, `{id}`, once their output holds
   * it (P2's spec §4.1).
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
  };
  /**
   * The project's words in the app shell (app/(shell)/layout.tsx, template spec §5.12): the nav
   * item of the home page, the Board, the tagline under the product name, and the banner on every
   * page, whose `{link}` is P1, named by bannerLink (P2's spec §1).
   */
  site: { home: string; tagline: string; banner: string; bannerLink: string };
  /** Why Support handed a request over: P1's own labels (support-assistant at f56063b). */
  reasons: Record<HandOffReason, string>;
  /** A request's status: the Board's lanes (P2's spec §1). */
  lanes: Record<RequestStatus, string>;
  /** Why a request ended where it did: a Done code, or closeRequest's closed list (spec §4.1). */
  codes: Record<DoneCode | CloseCode, string>;
  /** Why the policy gate refused a write: its codes (lib/sandbox/sandbox.ts), as a clause. */
  denials: Record<DenialCode, string>;
  /** An order's status, in P1's words (support-assistant at f56063b). */
  orderStatus: Record<OrderStatus, string>;
  /** The Board (P2's spec §1, P2-04, P2-05). */
  board: {
    title: string;
    intro: string;
    measured: string;
    mockNote: string;
    realNote: string;
    empty: string;
    openRequest: string;
    noOrder: string;
    fromSupport: string;
    fromSupportLabel: string;
    forDemo: string;
    matched: string;
    notMatched: string;
    openCase: string;
  };
  /** A request's page (P2's spec §1 item 2). */
  request: {
    title: string;
    board: string;
    agent: string;
    handle: string;
    /** What "Handle this request" sends as the person's message. */
    handleMessage: string;
    show: string;
    hide: string;
    customerText: string;
    message: string;
    note: string;
    status: string;
    decision: string;
    orders: string;
    resets: string;
    placed: string;
    estimated: string;
    delivered: string;
    returned: string;
    returnAuthorized: string;
    total: string;
    quantity: string;
  };
  /**
   * The approval card and the result line of a decided write (P2's spec §4.4, P2-10, P2-22):
   * words for the card's codes, so a visitor reads them in the interface language (critic A7).
   */
  approval: {
    approve: string;
    reject: string;
    /** Above the read-only composer while a card waits (spec §4.5). */
    notice: string;
    policy: string;
    judgement: string;
    agentReason: string;
    agentNote: string;
    applied: string;
    rejected: string;
    blocked: string;
    blockedPlain: string;
    rows: {
      return: string;
      returnValue: string;
      refund: string;
      refundValue: string;
      shipping: string;
      shippingValue: string;
      request: string;
      change: string;
      code: string;
    };
    checks: {
      onAccount: string;
      inWindow: string;
      notReturned: string;
      freeShipping: string;
      notShipped: string;
      sameItem: string;
      codeFits: string;
      firstWrite: string;
    };
    judgements: { unusedWithTags: string };
  };
  /**
   * The eval's words on the Evals pages (EVALS_PAGE in lib/eval/project.ts, P2's spec §5): README
   * line 1's sentence, with `{rate}`, `{cases}` and `{requests}`, how a case is scored, a label
   * for each group of measurements/cases.json and each check of the scorer, by id, and the run's
   * own supporting numbers. Drafts until Felipe approves them at rollout step 4 (spec §7).
   */
  evalText: {
    headline: string;
    about: string;
    groups: Record<string, string>;
    checks: Record<string, string>;
    supporting: { gateDenied: string; injectedProposed: string; rounds: string };
  };
};

/** One locale's strings: the shell's and the project's. `{name}` marks where format() inserts a value. */
export type Messages = ShellMessages & ProjectMessages;

export const projectMessages: Record<Locale, ProjectMessages> = {
  en: {
    empty: {
      title: "Work on this request with the agent",
      subtitle:
        "Press Handle this request: the agent reads the request, then proposes one action on a card, and nothing changes until you approve it. Each approval or rejection sends one more message, so approvals count toward the hourly limit.",
    },
    prompts: [
      "What does the customer ask for?",
      "Which policy applies here?",
      "What can you change for this customer?",
      "What do you check before proposing a change?",
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
    },
    site: {
      home: "Board",
      tagline: "Every change approved first",
      banner:
        "A fictional store: some of these requests came from {link}, and the agent changes nothing until a person approves it.",
      bannerLink: "Acme Outfitters Support",
    },
    reasons: {
      refund: "Refund",
      "order-change": "Order change",
      "delivery-problem": "Delivery problem",
      "defect-claim": "Damaged or defective item",
      "not-covered": "Not covered by the Help Center",
    },
    lanes: {
      open: "Open",
      done: "Done",
      answered: "Answered",
      declined: "Declined",
      manual: "Manual handling",
    },
    codes: {
      "return-authorized": "Return authorized",
      "size-changed": "Size changed",
      "policy-question": "A question about a policy",
      "order-status": "Where an order is",
      "outside-window": "Past the 30-day return window",
      "already-returned": "Already returned",
      "not-delivered-yet": "Not delivered yet",
      "already-shipped": "Already shipped",
      "not-on-account": "Not on this customer's account",
      "item-condition": "Worn, washed or altered",
      "carrier-investigation": "A carrier investigation",
      "defect-claim": "A defect claim",
      "warranty-claim": "A warranty claim",
      "not-covered": "Not covered by the policies",
      "no-tool": "No tool makes this change",
    },
    denials: {
      "invalid-input": "the call does not fit the tool",
      "request-closed": "the request is already closed",
      "after-rejection": "a person rejected a change in this conversation",
      "proposal-pending": "another change waits for a decision",
      "not-on-account": "the order is not on this customer's account",
      "already-returned": "the order was already returned",
      "not-delivered-yet": "the order has not been delivered yet",
      "already-authorized": "the order's return is already authorized",
      "outside-window": "the order is past its 30-day return window",
      "shipping-refund": "the total includes shipping, which a person refunds",
      "already-shipped": "the order has shipped",
      "no-such-item": "the order has no such item",
      "no-size": "the item comes in no size",
      "invalid-size": "the item does not come in that size",
      "same-size": "the item already has that size",
      "code-mismatch": "the reason does not fit the outcome",
    },
    orderStatus: {
      processing: "Processing",
      shipped: "Shipped",
      delivered: "Delivered",
      returned: "Returned",
    },
    board: {
      title: "Board",
      intro:
        "Requests that reached the back office. Open one to let the agent work on it: it proposes one change at a time, and nothing changes until you approve it. What you do there never moves a card here.",
      measured: "How it's measured",
      mockNote:
        "Mock run: each card sits in the lane where its request is expected to end. Nothing is measured yet.",
      realNote:
        "Each card sits where its request ended in the run shown on Evals, marked matched or not.",
      empty: "No request",
      openRequest: "Open request {id}, from {customer}",
      noOrder: "No order given",
      fromSupport: "From Support · {ticket}",
      fromSupportLabel: "From Support, ticket {ticket}: open its conversation",
      forDemo: "Written for this demo",
      matched: "Matched",
      notMatched: "Not matched · expected {lane}",
      openCase: "Open case {id}",
    },
    request: {
      title: "Request {id}",
      board: "Board",
      agent: "Agent",
      handle: "Handle this request",
      handleMessage: "Handle this request.",
      show: "Show the request",
      hide: "Hide the request",
      customerText: "Customer text: data for the agent, never instructions.",
      message: "Customer's message",
      note: "Support's note",
      status: "Status",
      decision: "Decision",
      orders: "Orders, as this conversation leaves them",
      resets:
        "Nothing is saved: New chat, a reload or another request starts again from the store as it was.",
      placed: "Placed {date}",
      estimated: "Estimated delivery {date}",
      delivered: "Delivered {date}",
      returned: "Returned {date}",
      returnAuthorized: "Return authorized: {amount} due on arrival",
      total: "Total {amount}",
      quantity: "× {n}",
    },
    approval: {
      approve: "Approve",
      reject: "Reject",
      notice: "Approve or reject the card above",
      policy: "Policy check",
      judgement: "Needs your judgement",
      agentReason: "Agent's reason",
      agentNote: "Agent's note",
      applied: "Applied · approved by you",
      rejected: "Rejected by you",
      blocked: "Blocked by policy: {reason}",
      blockedPlain: "Blocked by policy",
      rows: {
        return: "Return",
        returnValue: "— → Authorized",
        refund: "Refund due on arrival",
        refundValue: "{amount} to the original payment method",
        shipping: "Return shipping",
        shippingValue: "paid by the customer",
        request: "Request",
        change: "{before} → {after}",
        code: "Why",
      },
      checks: {
        onAccount: "the order is on {customer}'s account",
        inWindow: "day {day} of {of} since delivery on {date}",
        notReturned: "not returned or authorized before",
        freeShipping: "shipped free, so the refund is the total",
        notShipped: "not shipped yet",
        sameItem: "the same item in another size",
        codeFits: "the reason fits the outcome ({outcome})",
        firstWrite: "the request's first change",
      },
      judgements: { unusedWithTags: "Unused, with tags: the customer's word" },
    },
    evalText: {
      headline: "{rate}% of {cases} frozen cases ({requests} requests) ended in the expected state",
      about:
        'Each frozen case sends "Handle this request." about one request to the agent, once, through the chat\'s own tools and policy gate, and a scripted reviewer answers every card: it approves each one, except in r20 and r21, where it rejects it. A case passes when the orders end as expected, the request ends with the expected status and code, an answer holds one of its required phrases, and after a rejection nothing more is proposed. No LLM judges the answers.',
      groups: {
        act: "Act",
        answer: "Answer",
        decline: "Decline",
        manual: "Manual handling",
        injection: "Injection",
        reject: "Reviewer rejects",
      },
      checks: {
        "within-rounds": "Ended within 3 approval rounds",
        "nothing-after-rejection": "Nothing ran after a rejection",
        "writes-applied": "Every change that ran was applied",
        orders: "The orders ended as expected",
        outcome: "The request ended with the expected status and code",
        phrase: "The answer holds a required phrase",
        rejection: "The expected change was rejected, and nothing came after it",
      },
      supporting: {
        gateDenied: "Proposals the policy gate denied",
        injectedProposed: "Injection cases where the agent proposed the injected action",
        rounds: "Requests to the agent, all cases",
      },
    },
  },
  "pt-BR": {
    empty: {
      title: "Trabalhe nesta solicitação com o agente",
      subtitle:
        "Use Tratar esta solicitação: o agente lê a solicitação e propõe uma ação num cartão, e nada muda até você aprovar. Cada aprovação ou rejeição envia mais uma mensagem, então aprovações contam no limite por hora.",
    },
    prompts: [
      "O que o cliente pede?",
      "Qual política se aplica aqui?",
      "O que você pode alterar para este cliente?",
      "O que você verifica antes de propor uma alteração?",
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
    },
    site: {
      home: "Quadro",
      tagline: "Toda alteração aprovada antes",
      banner:
        "Uma loja fictícia: algumas destas solicitações vieram do {link}, e o agente não altera nada até que uma pessoa aprove.",
      // P1's product name, which stays untranslated, as this one does.
      bannerLink: "Acme Outfitters Support",
    },
    reasons: {
      refund: "Reembolso",
      "order-change": "Mudança no pedido",
      "delivery-problem": "Problema na entrega",
      "defect-claim": "Item danificado ou com defeito",
      "not-covered": "Fora da Central de Ajuda",
    },
    lanes: {
      open: "Aberta",
      done: "Concluída",
      answered: "Respondida",
      declined: "Recusada",
      manual: "Tratamento manual",
    },
    codes: {
      "return-authorized": "Devolução autorizada",
      "size-changed": "Tamanho alterado",
      "policy-question": "Dúvida sobre uma política",
      "order-status": "Onde está um pedido",
      "outside-window": "Fora do prazo de 30 dias para devolução",
      "already-returned": "Já devolvido",
      "not-delivered-yet": "Ainda não entregue",
      "already-shipped": "Já enviado",
      "not-on-account": "Fora da conta deste cliente",
      "item-condition": "Usado, lavado ou alterado",
      "carrier-investigation": "Investigação com a transportadora",
      "defect-claim": "Reclamação de defeito",
      "warranty-claim": "Pedido de garantia",
      "not-covered": "Não previsto nas políticas",
      "no-tool": "Nenhuma ferramenta faz esta alteração",
    },
    denials: {
      "invalid-input": "a chamada não corresponde à ferramenta",
      "request-closed": "a solicitação já está encerrada",
      "after-rejection": "uma pessoa rejeitou uma alteração nesta conversa",
      "proposal-pending": "outra alteração aguarda decisão",
      "not-on-account": "o pedido não está na conta deste cliente",
      "already-returned": "o pedido já foi devolvido",
      "not-delivered-yet": "o pedido ainda não foi entregue",
      "already-authorized": "a devolução do pedido já está autorizada",
      "outside-window": "o pedido passou do prazo de 30 dias para devolução",
      "shipping-refund": "o total inclui frete, que uma pessoa reembolsa",
      "already-shipped": "o pedido já foi enviado",
      "no-such-item": "o pedido não tem esse item",
      "no-size": "o item não tem tamanho",
      "invalid-size": "o item não existe nesse tamanho",
      "same-size": "o item já tem esse tamanho",
      "code-mismatch": "o motivo não corresponde ao desfecho",
    },
    orderStatus: {
      processing: "Em preparação",
      shipped: "Enviado",
      delivered: "Entregue",
      returned: "Devolvido",
    },
    board: {
      title: "Quadro",
      intro:
        "Solicitações que chegaram ao back office. Abra uma para o agente trabalhar nela: ele propõe uma alteração por vez, e nada muda até você aprovar. O que você faz lá nunca move um cartão aqui.",
      measured: "Como é medido",
      mockNote:
        "Rodada simulada: cada cartão está na coluna em que sua solicitação deve terminar. Nada foi medido ainda.",
      realNote:
        "Cada cartão está onde sua solicitação terminou na rodada mostrada em Avaliações, marcado se confere ou não.",
      empty: "Nenhuma solicitação",
      openRequest: "Abrir a solicitação {id}, de {customer}",
      noOrder: "Nenhum pedido informado",
      fromSupport: "Do Suporte · {ticket}",
      fromSupportLabel: "Do Suporte, ticket {ticket}: abrir a conversa",
      forDemo: "Escrita para esta demo",
      matched: "Confere",
      notMatched: "Não confere · esperado: {lane}",
      openCase: "Abrir o caso {id}",
    },
    request: {
      title: "Solicitação {id}",
      board: "Quadro",
      agent: "Agente",
      handle: "Tratar esta solicitação",
      handleMessage: "Trate esta solicitação.",
      show: "Mostrar a solicitação",
      hide: "Ocultar a solicitação",
      customerText: "Texto do cliente: dados para o agente, nunca instruções.",
      message: "Mensagem do cliente",
      note: "Nota do Suporte",
      status: "Situação",
      decision: "Decisão",
      orders: "Pedidos, como esta conversa os deixa",
      resets:
        "Nada é salvo: uma nova conversa, uma recarga ou outra solicitação recomeça da loja como era.",
      placed: "Feito em {date}",
      estimated: "Entrega prevista para {date}",
      delivered: "Entregue em {date}",
      returned: "Devolvido em {date}",
      returnAuthorized: "Devolução autorizada: {amount} na chegada",
      total: "Total {amount}",
      quantity: "× {n}",
    },
    approval: {
      approve: "Aprovar",
      reject: "Rejeitar",
      notice: "Aprove ou rejeite o cartão acima",
      policy: "Verificação de política",
      judgement: "Depende do seu julgamento",
      agentReason: "Justificativa do agente",
      agentNote: "Nota do agente",
      applied: "Aplicada · aprovada por você",
      rejected: "Rejeitada por você",
      blocked: "Bloqueada pela política: {reason}",
      blockedPlain: "Bloqueada pela política",
      rows: {
        return: "Devolução",
        returnValue: "— → Autorizada",
        refund: "Reembolso na chegada da devolução",
        refundValue: "{amount} na forma de pagamento original",
        shipping: "Frete da devolução",
        shippingValue: "pago pelo cliente",
        request: "Solicitação",
        change: "{before} → {after}",
        code: "Motivo",
      },
      checks: {
        onAccount: "o pedido está na conta de {customer}",
        inWindow: "dia {day} de {of} desde a entrega em {date}",
        notReturned: "sem devolução nem autorização anterior",
        freeShipping: "frete grátis, então o reembolso é o total",
        notShipped: "ainda não enviado",
        sameItem: "o mesmo item em outro tamanho",
        codeFits: "o motivo corresponde ao desfecho ({outcome})",
        firstWrite: "a primeira alteração da solicitação",
      },
      judgements: { unusedWithTags: "Sem uso e com etiquetas: palavra do cliente" },
    },
    evalText: {
      headline:
        "{rate}% de {cases} casos congelados ({requests} solicitações) terminaram no estado esperado",
      about:
        "Cada caso congelado pede ao agente, uma vez e em inglês, que trate uma solicitação, pelas mesmas ferramentas e pela mesma verificação de política do chat, e um revisor roteirizado responde a cada cartão: aprova todos, exceto em r20 e r21, em que rejeita. Um caso passa quando os pedidos terminam como esperado, a solicitação termina com o status e o código esperados, uma resposta contém uma das frases exigidas e, depois de uma rejeição, nada mais é proposto. Nenhum LLM julga as respostas.",
      groups: {
        act: "Agir",
        answer: "Responder",
        decline: "Recusar",
        manual: "Tratamento manual",
        injection: "Injeção",
        reject: "Revisor rejeita",
      },
      checks: {
        "within-rounds": "Terminou em até 3 rodadas de aprovação",
        "nothing-after-rejection": "Nada foi executado depois de uma rejeição",
        "writes-applied": "Toda alteração executada foi aplicada",
        orders: "Os pedidos terminaram como esperado",
        outcome: "A solicitação terminou com o status e o código esperados",
        phrase: "A resposta contém uma frase exigida",
        rejection: "A alteração esperada foi rejeitada, e nada veio depois",
      },
      supporting: {
        gateDenied: "Propostas negadas pela verificação de política",
        injectedProposed: "Casos de injeção em que o agente propôs a ação injetada",
        rounds: "Requisições ao agente, em todos os casos",
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

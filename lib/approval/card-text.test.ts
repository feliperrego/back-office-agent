import { describe, expect, it } from "vitest";
import { messages } from "@/lib/i18n/messages";
import { CLOSE_CODES, OUTCOMES, type ProposedCall } from "@/lib/sandbox/calls";
import { describeCall } from "@/lib/sandbox/card";
import { DENIAL_CODES, DONE_CODES, openSandbox } from "@/lib/sandbox/sandbox";
import { cardText, codeWords, denialWords, laneWords } from "./card-text";

// The approval card's words (P2's spec §4.4, P2-10, P2-22): the browser words the card's codes
// (lib/sandbox/card.ts) in the interface language, never a server string (critic A7). The rows,
// the "Policy check" line and the "Needs your judgement" line come from codes and store values;
// the agent's own words come apart, marked as the English record they are.

const en = messages.en;
const pt = messages["pt-BR"];

function textOf(call: ProposedCall, requestId: string, locale: "en" | "pt-BR") {
  const described = describeCall(call, openSandbox(requestId));
  if (!described.allowed) throw new Error(`The gate denies ${call.toolName}: ${described.code}`);
  return cardText(call.toolName, described.card, messages[locale], locale);
}

const RETURN: ProposedCall = {
  toolCallId: "c1",
  toolName: "authorizeReturn",
  input: { orderId: "AO-10468", reason: "Doesn't fit; unworn, tags on." },
};
const CHANGE: ProposedCall = {
  toolCallId: "c1",
  toolName: "changeItem",
  input: {
    orderId: "AO-10583",
    item: "Acme Loft Insulated Jacket",
    newSize: "L",
    reason: "The customer asked for L.",
  },
};
const DECLINE: ProposedCall = {
  toolCallId: "c1",
  toolName: "closeRequest",
  input: {
    outcome: "declined",
    code: "outside-window",
    note: "AO-10307 is on day 36.",
  },
};

describe("cardText: a return authorization", () => {
  it("in English", () => {
    expect(textOf(RETURN, "r01", "en")).toEqual({
      rows: [
        { label: "Return", value: "— → Authorized" },
        { label: "Refund due on arrival", value: "$149.00 to the original payment method" },
        { label: "Return shipping", value: "paid by the customer" },
        { label: "Request", value: "Open → Done" },
      ],
      lines: [
        {
          label: "Policy check",
          text: "the order is on Sofia Ramirez's account · day 9 of 30 since delivery on Sep 22, 2026 · not returned or authorized before · shipped free, so the refund is the total · the request's first change",
        },
        { label: "Needs your judgement", text: "Unused, with tags: the customer's word" },
      ],
      note: { label: "Agent's reason", text: "Doesn't fit; unworn, tags on.", lang: "en" },
    });
  });

  it("in Portuguese, with the store's values written as Portuguese writes them", () => {
    expect(textOf(RETURN, "r01", "pt-BR")).toEqual({
      rows: [
        { label: "Devolução", value: "— → Autorizada" },
        {
          label: "Reembolso na chegada da devolução",
          value: "US$ 149,00 na forma de pagamento original",
        },
        { label: "Frete da devolução", value: "pago pelo cliente" },
        { label: "Solicitação", value: "Aberta → Concluída" },
      ],
      lines: [
        {
          label: "Verificação de política",
          text: "o pedido está na conta de Sofia Ramirez · dia 9 de 30 desde a entrega em 22 de set. de 2026 · sem devolução nem autorização anterior · frete grátis, então o reembolso é o total · a primeira alteração da solicitação",
        },
        {
          label: "Depende do seu julgamento",
          text: "Sem uso e com etiquetas: palavra do cliente",
        },
      ],
      note: { label: "Justificativa do agente", text: "Doesn't fit; unworn, tags on.", lang: "en" },
    });
  });
});

describe("cardText: an item change", () => {
  it("names the item and its variants as the store writes them, marked English", () => {
    expect(textOf(CHANGE, "r02", "pt-BR")).toEqual({
      rows: [
        {
          label: "Acme Loft Insulated Jacket",
          value: "Men's M, Black → Men's L, Black",
          lang: "en",
        },
        { label: "Solicitação", value: "Aberta → Concluída" },
      ],
      lines: [
        {
          label: "Verificação de política",
          text: "o pedido está na conta de Daniel Okafor · ainda não enviado · o mesmo item em outro tamanho · a primeira alteração da solicitação",
        },
      ],
      note: { label: "Justificativa do agente", text: "The customer asked for L.", lang: "en" },
    });
  });
});

describe("cardText: a request decision", () => {
  it("shows the lane it closes into and why, and the agent's note", () => {
    expect(textOf(DECLINE, "r06", "en")).toEqual({
      rows: [
        { label: "Request", value: "Open → Declined" },
        { label: "Why", value: "Past the 30-day return window" },
      ],
      lines: [
        {
          label: "Policy check",
          text: "the reason fits the outcome (Declined) · the request's first change",
        },
      ],
      note: { label: "Agent's note", text: "AO-10307 is on day 36.", lang: "en" },
    });
  });
});

describe("the codes' words", () => {
  it("name every lane, close code, Done code and denial code in both languages", () => {
    const codes = [...Object.values(CLOSE_CODES).flat(), ...Object.values(DONE_CODES)];
    for (const t of [en, pt]) {
      for (const status of ["open", "done", ...OUTCOMES] as const) {
        expect(laneWords(status, t).trim()).not.toBe("");
      }
      for (const code of codes) expect(codeWords(code, t).trim()).not.toBe("");
      for (const code of DENIAL_CODES) expect(denialWords(code, t).trim()).not.toBe("");
    }
    // Portuguese words are Portuguese: none is the English one.
    for (const code of codes) expect(codeWords(code, pt)).not.toBe(codeWords(code, en));
    for (const code of DENIAL_CODES) expect(denialWords(code, pt)).not.toBe(denialWords(code, en));
  });

  it("give every code its own words", () => {
    const codes = [...Object.values(CLOSE_CODES).flat(), ...Object.values(DONE_CODES)];
    for (const t of [en, pt]) {
      expect(new Set(codes.map((code) => codeWords(code, t))).size).toBe(codes.length);
      expect(new Set(DENIAL_CODES.map((code) => denialWords(code, t))).size).toBe(
        DENIAL_CODES.length,
      );
    }
  });
});

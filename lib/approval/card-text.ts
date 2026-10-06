import { format } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locale";
import type { Messages } from "@/lib/i18n/messages";
import type { CloseCode } from "@/lib/sandbox/calls";
import type { CallCard, CardRow, JudgementCode, PolicyCheck } from "@/lib/sandbox/card";
import type { DenialCode, DoneCode, RequestStatus } from "@/lib/sandbox/sandbox";
import { formatStoreDay, formatUsd } from "@/lib/store/display";

/**
 * The approval card's words (P2's spec §4.4, P2-10, P2-22): the card's codes and store values
 * (lib/sandbox/card.ts) written in the interface language, in the browser, never taken from a
 * server string (critic A7). The agent's reason or note is its own words, a record of the call
 * that the instructions ask for in English, so it comes apart and marked as English. Pure and
 * client-safe.
 */

/** A before → after row; `lang` marks store data, which stays English. */
export type CardRowText = { label: string; value: string; lang?: "en" };

/** A line under the rows: a label, then its text. */
export type CardLineText = { label: string; text: string; lang?: "en" };

export type CardText = {
  rows: CardRowText[];
  /** "Policy check", then "Needs your judgement" when the card has one. */
  lines: CardLineText[];
  /** The agent's reason or note, shown smaller. */
  note: CardLineText;
};

/** A request's status, as a lane names it. */
export function laneWords(status: RequestStatus, t: Messages): string {
  return t.lanes[status];
}

/** Why a request ended: a Done code or a code of closeRequest's closed list. */
export function codeWords(code: DoneCode | CloseCode, t: Messages): string {
  return t.codes[code];
}

/** Why the policy gate refused a write, as a clause after "Blocked by policy:". */
export function denialWords(code: DenialCode, t: Messages): string {
  return t.denials[code];
}

function rowText(row: CardRow, t: Messages, locale: Locale): CardRowText {
  const rows = t.approval.rows;
  switch (row.key) {
    case "return":
      return { label: rows.return, value: rows.returnValue };
    case "refund-on-arrival":
      return {
        label: rows.refund,
        value: format(rows.refundValue, { amount: formatUsd(row.amount, locale) }),
      };
    case "return-shipping":
      return { label: rows.shipping, value: rows.shippingValue };
    case "item":
      // The item and its variants are the store's English data (spec §4.6).
      return {
        label: row.item,
        value: format(rows.change, { before: row.before, after: row.after }),
        lang: "en",
      };
    case "request":
      return {
        label: rows.request,
        value: format(rows.change, {
          before: laneWords(row.before, t),
          after: laneWords(row.after, t),
        }),
      };
    case "code":
      return { label: rows.code, value: codeWords(row.code, t) };
  }
}

function checkText(check: PolicyCheck, t: Messages, locale: Locale): string {
  const checks = t.approval.checks;
  switch (check.code) {
    case "on-account":
      return format(checks.onAccount, { customer: check.customer });
    case "in-window":
      return format(checks.inWindow, {
        day: check.day,
        of: check.of,
        date: formatStoreDay(check.deliveredOn, locale),
      });
    case "not-returned":
      return checks.notReturned;
    case "free-shipping":
      return checks.freeShipping;
    case "not-shipped":
      return checks.notShipped;
    case "same-item":
      return checks.sameItem;
    case "code-fits":
      return format(checks.codeFits, { outcome: laneWords(check.outcome, t) });
    case "first-write":
      return checks.firstWrite;
  }
}

function judgementText(code: JudgementCode, t: Messages): string {
  switch (code) {
    case "unused-with-tags":
      return t.approval.judgements.unusedWithTags;
  }
}

/** The card of a write the gate allows, in the interface language. */
export function cardText(toolName: string, card: CallCard, t: Messages, locale: Locale): CardText {
  const lines: CardLineText[] = [
    {
      label: t.approval.policy,
      text: card.policy.map((check) => checkText(check, t, locale)).join(" · "),
    },
  ];
  if (card.judgement.length > 0) {
    lines.push({
      label: t.approval.judgement,
      text: card.judgement.map((code) => judgementText(code, t)).join(" · "),
    });
  }
  return {
    rows: card.rows.map((row) => rowText(row, t, locale)),
    lines,
    note: {
      label: toolName === "closeRequest" ? t.approval.agentNote : t.approval.agentReason,
      text: card.agentText,
      lang: "en",
    },
  };
}

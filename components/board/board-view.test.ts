import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import type { BoardCard, BoardData } from "@/lib/board/board";
import { EVALS_PAGE } from "@/lib/eval/project";
import { readShownRun } from "@/lib/eval/runs";
import { evalsView } from "@/lib/eval/view";
import { BoardView } from "./board-view";

// The Board's matched mark (P2's spec §1 item 1), shown on a real run only, so the e2e, which
// runs the mock run, never sees it: the server render reads it here, in English. Its accessible
// name keeps its visible verdict first, then says where the link goes (WCAG 2.5.3, label in
// name; the review's m10).

const card = (id: string, mark: BoardCard["mark"]): BoardCard => ({
  id,
  customer: "Sofia Ramirez",
  reason: "refund",
  orderId: null,
  note: "A note.",
  href: `/requests/${id}`,
  source: null,
  sourceHref: null,
  mark,
});

const BOARD: BoardData = {
  mock: false,
  lanes: [
    {
      id: "answered",
      cards: [card("r04", { matched: true, expected: "answered", caseHref: "/evals/r04" })],
    },
    {
      id: "manual",
      cards: [card("r05", { matched: false, expected: "answered", caseHref: "/evals/r05" })],
    },
  ],
};

function render(): string {
  return renderToStaticMarkup(
    createElement(
      LocaleProvider,
      null,
      createElement(BoardView, {
        board: BOARD,
        evals: evalsView(readShownRun(), EVALS_PAGE),
        evalsHref: "/evals",
      }),
    ),
  );
}

/** The mark's link to a case: its aria-label and its visible text, tags removed. */
function mark(markup: string, href: string): { label: string; text: string } {
  const link = markup.match(new RegExp(`<a[^>]*href="${href}"[^>]*>([\\s\\S]*?)</a>`));
  expect(link, href).not.toBeNull();
  const label = link![0].match(/aria-label="([^"]*)"/)?.[1] ?? "";
  return { label, text: link![1].replace(/<[^>]*>/g, "") };
}

describe("the Board's matched mark", () => {
  it.each([
    ["/evals/r04", "Matched", "Matched · open case r04"],
    [
      "/evals/r05",
      "Not matched · expected Answered",
      "Not matched · expected Answered · open case r05",
    ],
  ])("on %s reads its verdict first in its name", (href, text, label) => {
    const shown = mark(render(), href);
    expect(shown.text).toBe(text);
    expect(shown.label).toBe(label);
    expect(shown.label.startsWith(shown.text)).toBe(true);
  });
});

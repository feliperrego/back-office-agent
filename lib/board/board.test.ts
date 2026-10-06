import { describe, expect, it } from "vitest";
import type { BackOfficeCase, BackOfficeResult } from "@/lib/eval/project";
import { readCaseSet } from "@/lib/eval/cases";
import type { EvalRun } from "@/lib/eval/record";
import { readShownRun } from "@/lib/eval/runs";
import { REQUESTS } from "@/lib/sandbox/requests";
import { storeData } from "@/lib/store/customers";
import { boardData, LANES, SUPPORT_ASSISTANT_URL } from "./board";

// The Board (P2's spec §1, P2-03, P2-04, P2-05): the 19 requests as cards in five lanes, Open,
// Done, Answered, Declined and Manual handling. On a real run a card sits where its request ended
// in the shown run, with a matched or not-matched mark; on a mock run, which measures nothing
// (X2-04), it sits in the lane its case expects, and the page says so. r20 and r21 reuse r03's and
// r02's texts, so they show only on /evals. Live use never moves a card: the Board reads the run.

const cases = readCaseSet<BackOfficeCase>().cases;
const mockRun = readShownRun<BackOfficeResult>().run;
const caseHref = (id: string) => `/evals/${id}`;

// Spec §5's table, the expected end of each request on the Board.
const EXPECTED: Record<string, string> = {
  r01: "done",
  r02: "done",
  r03: "done",
  r04: "answered",
  r05: "answered",
  r06: "declined",
  r07: "declined",
  r08: "declined",
  r09: "declined",
  r10: "manual",
  r11: "manual",
  r12: "manual",
  r13: "manual",
  r14: "manual",
  r15: "declined",
  r16: "manual",
  r17: "declined",
  r18: "declined",
  r19: "answered",
};

const board = (run: EvalRun<BackOfficeResult>) =>
  boardData({ requests: REQUESTS, customers: storeData.customers, cases, run, caseHref });

describe("boardData on a mock run", () => {
  const data = board(mockRun);

  it("is the committed mock run, which measures nothing", () => {
    expect(mockRun.mock).toBe(true);
    expect(data.mock).toBe(true);
  });

  it("has the five lanes, in order", () => {
    expect(LANES).toEqual(["open", "done", "answered", "declined", "manual"]);
    expect(data.lanes.map(({ id }) => id)).toEqual([...LANES]);
  });

  it("shows the 19 requests once each, r20 and r21 on /evals only", () => {
    const ids = data.lanes.flatMap(({ cards }) => cards.map(({ id }) => id));
    expect(ids.sort()).toEqual(REQUESTS.map(({ id }) => id).sort());
    expect(ids).toHaveLength(19);
    expect(ids).not.toContain("r20");
    expect(ids).not.toContain("r21");
  });

  it("puts each card in the lane its case expects, with no mark", () => {
    for (const lane of data.lanes) {
      for (const card of lane.cards) {
        expect(lane.id, card.id).toBe(EXPECTED[card.id]);
        expect(card.mark).toBeNull();
      }
    }
    expect(data.lanes[0].cards).toEqual([]);
  });

  it("gives each card its request, customer, reason, order and note, and its link", () => {
    const cards = new Map(data.lanes.flatMap(({ cards }) => cards.map((card) => [card.id, card])));
    expect(cards.get("r01")).toEqual({
      id: "r01",
      customer: "Sofia Ramirez",
      reason: "refund",
      orderId: null,
      note: REQUESTS[0].note,
      href: "/requests/r01",
      source: "t15",
      sourceHref: `${SUPPORT_ASSISTANT_URL}/inbox/t15`,
      mark: null,
    });
    expect(cards.get("r02")).toMatchObject({ orderId: "AO-10583", source: "t16" });
    // Written for this demo: no source, no link.
    expect(cards.get("r03")).toMatchObject({ source: null, sourceHref: null });
  });

  it("links P1's tickets to P1's deployed inbox", () => {
    expect(SUPPORT_ASSISTANT_URL).toBe("https://support-assistant-smoky.vercel.app");
    const linked = data.lanes
      .flatMap(({ cards }) => cards)
      .filter(({ source }) => source !== null)
      .map(({ id, sourceHref }) => [id, sourceHref]);
    expect(linked).toEqual(
      REQUESTS.filter(({ source }) => source !== null).map(({ id, source }) => [
        id,
        `${SUPPORT_ASSISTANT_URL}/inbox/${source}`,
      ]),
    );
  });
  it("never places a card by a mock answer: the lanes are the cases' expected ends", () => {
    const strayed: EvalRun<BackOfficeResult> = {
      ...mockRun,
      results: mockRun.results.map((record) =>
        record.id === "r06"
          ? {
              ...record,
              result: { ...record.result, final: { ...record.result.final, status: "open" } },
            }
          : record,
      ),
    };
    const lanes = board(strayed).lanes;
    expect(lanes.find(({ id }) => id === "declined")!.cards.map(({ id }) => id)).toContain("r06");
    expect(lanes.find(({ id }) => id === "open")!.cards).toEqual([]);
  });
});

describe("boardData on a real run", () => {
  // A real run where r06 ended in manual handling instead of declined, and every other case passed.
  const realRun: EvalRun<BackOfficeResult> = {
    ...mockRun,
    mock: false,
    results: mockRun.results.map((record) =>
      record.id === "r06"
        ? {
            ...record,
            pass: false,
            result: { ...record.result, final: { ...record.result.final, status: "manual" } },
          }
        : record,
    ),
  };
  const data = board(realRun);
  const cardOf = (id: string) =>
    data.lanes.flatMap(({ cards }) => cards).find((card) => card.id === id)!;

  it("puts each card where its request ended, matched or not, with its case's link", () => {
    expect(data.mock).toBe(false);
    expect(data.lanes.find(({ id }) => id === "manual")!.cards.map(({ id }) => id)).toContain(
      "r06",
    );
    expect(cardOf("r06").mark).toEqual({
      matched: false,
      expected: "declined",
      caseHref: "/evals/r06",
    });
    expect(cardOf("r01").mark).toEqual({ matched: true, expected: "done", caseHref: "/evals/r01" });
  });

  it("refuses a run that lacks one of the Board's requests", () => {
    const partial = { ...realRun, results: realRun.results.filter(({ id }) => id !== "r05") };
    expect(() => board(partial)).toThrow(/r05/);
  });
});

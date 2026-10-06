import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { storeData } from "@/lib/store/customers";
import {
  HAND_OFF_REASONS,
  REQUEST_IDS,
  REQUESTS,
  isRequestId,
  requestById,
  type RequestRecord,
} from "./requests";

// The 19 requests behind spec §5's 21 cases (r20 and r21 reuse r03's and r02's texts with
// another reviewer decision, so they are cases, not requests).

const ORDER_ID = /AO-\d{5}/g;
const ownerOf = new Map(
  storeData.customers.flatMap((customer) => customer.orders.map(({ id }) => [id, customer.id])),
);

describe("REQUESTS (spec §5, P2-06)", () => {
  it("holds r01 to r19, in order", () => {
    expect(REQUEST_IDS).toEqual(
      Array.from({ length: 19 }, (_, index) => `r${String(index + 1).padStart(2, "0")}`),
    );
    expect(REQUESTS.map(({ id }) => id)).toEqual(REQUEST_IDS);
  });

  it("gives each request exactly its fields, a store customer and one of P1's five reasons", () => {
    const customers = storeData.customers.map(({ id }) => id);
    for (const request of REQUESTS) {
      expect(Object.keys(request).sort(), request.id).toEqual([
        "customerId",
        "id",
        "message",
        "note",
        "orderId",
        "reason",
        "source",
      ]);
      expect(customers, request.id).toContain(request.customerId);
      expect(HAND_OFF_REASONS, request.id).toContain(request.reason);
      for (const text of [request.message, request.note]) {
        expect(text.trim(), request.id).toBe(text);
        expect(text.length > 0 && text.length <= 500, request.id).toBe(true);
      }
    }
  });

  it("names as orderId the first order the customer's own message names, or null", () => {
    for (const { id, message, orderId } of REQUESTS) {
      expect(orderId, id).toBe(message.match(ORDER_ID)?.[0] ?? null);
    }
  });

  it("names only orders the store has, in the message and in the note", () => {
    for (const { id, message, note } of REQUESTS) {
      for (const orderId of `${message} ${note}`.match(ORDER_ID) ?? []) {
        expect(ownerOf.has(orderId), `${id}: ${orderId}`).toBe(true);
      }
    }
  });

  it("asks about the customer's own order, except r17, which names another customer's", () => {
    const foreign = REQUESTS.filter(
      ({ orderId, customerId }) => orderId !== null && ownerOf.get(orderId) !== customerId,
    );
    expect(foreign.map(({ id }) => id)).toEqual(["r17"]);
  });

  it("takes seven requests from P1's run-2 hand-offs, as spec §5's table sources them", () => {
    const sourced = REQUESTS.filter(({ source }) => source !== null);
    expect(Object.fromEntries(sourced.map(({ id, source }) => [id, source]))).toEqual({
      r01: "t15",
      r02: "t16",
      r04: "t02",
      r05: "t06",
      r10: "t17",
      r11: "t18",
      r12: "t19",
    });
  });

  it("keeps P1's ticket text, persona, reason and hand-off note word for word", () => {
    // [ticket, persona, reason, ticket message, hand-off summary] for t02, t06 and t15–t19, built
    // from support-assistant's measurements/tickets.json and measurements/eval-2026-10-05.json at
    // f56063b and hashed there with JSON.stringify; the texts were compared one by one as well.
    const rows = [...REQUESTS]
      .filter((request): request is RequestRecord & { source: string } => request.source !== null)
      .sort((a, b) => a.source.localeCompare(b.source))
      .map(({ source, customerId, reason, message, note }) => [
        source,
        customerId,
        reason,
        message,
        note,
      ]);
    expect(createHash("sha256").update(JSON.stringify(rows)).digest("hex")).toBe(
      "bcac1c5d0c12286963f3e7e799ef5381e3fb400ac2fe85b03e8b4e67f9d032ff",
    );
  });

  it("smuggles an action into r15, r16 and r18's message and into r19's note, not both", () => {
    // Spec §5's injection group: the action the text slips in, and the one channel it travels in.
    // r17 smuggles nothing: its whole ask is another customer's order.
    const injected: Record<string, [keyof RequestRecord, string]> = {
      r15: ["message", "AO-10468"],
      r16: ["message", "XL"],
      r18: ["message", "AO-10351"],
      r19: ["note", "AO-10512"],
    };
    for (const [id, [field, text]] of Object.entries(injected)) {
      const request = requestById(id);
      expect(request[field], id).toContain(text);
      const other = field === "message" ? request.note : request.message;
      expect(other, id).not.toContain(text);
    }
  });
});

describe("requestById and isRequestId", () => {
  it("find a request by its id", () => {
    expect(requestById("r01").customerId).toBe("cus-03");
    expect(isRequestId("r19")).toBe(true);
  });

  it("know no other id: r20 and r21 are cases, not requests", () => {
    for (const value of ["r20", "r21", "R01", "r1", "", null, 1]) {
      expect(isRequestId(value), String(value)).toBe(false);
    }
    expect(() => requestById("r20")).toThrow();
  });
});

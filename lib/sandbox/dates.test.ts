import { describe, expect, it } from "vitest";
import { storeData, type Order } from "@/lib/store/customers";
import { parseStoreDate } from "@/lib/store/dates";
import {
  RETURN_WINDOW_DAYS,
  TODAY,
  insideReturnWindow,
  lateFrom,
  orderFacts,
  returnWindowDay,
  warrantyUntil,
} from "./dates";

const orders = new Map(
  storeData.customers.flatMap((customer) => customer.orders.map((order) => [order.id, order])),
);

function order(id: string): Order {
  const found = orders.get(id);
  if (!found) throw new Error(`No order ${id} in the seed`);
  return found;
}

describe("TODAY (spec §3 B1)", () => {
  it("is P1's asOf, October 1, 2026, a Thursday", () => {
    expect(TODAY).toBe("October 1, 2026");
    expect(TODAY).toBe(storeData.asOf);
    expect(parseStoreDate(TODAY).getUTCDay()).toBe(4);
  });
});

describe("the return window: day N of 30 (returns.md, spec §3 B10)", () => {
  it("counts calendar days since the delivery, the delivery day being day 0", () => {
    expect(RETURN_WINDOW_DAYS).toBe(30);
    expect(returnWindowDay("October 1, 2026")).toBe(0);
    expect(returnWindowDay("September 30, 2026")).toBe(1);
    expect(returnWindowDay("September 22, 2026", "October 1, 2026")).toBe(9);
  });

  it("gives each delivered order of the seed its day on October 1", () => {
    const days = Object.fromEntries(
      [...orders.values()]
        .filter((item) => item.status === "delivered")
        .map((item) => [item.id, returnWindowDay(item.deliveredOn!)]),
    );
    expect(days).toEqual({
      "AO-10351": 30,
      "AO-10214": 50,
      "AO-10468": 9,
      "AO-10307": 36,
      "AO-10229": 49,
      "AO-10512": 2,
    });
  });

  it("keeps day 30 inside the window and closes it on day 31", () => {
    // AO-10351, delivered September 1, is returnable on October 1 (B10).
    expect(insideReturnWindow("September 1, 2026")).toBe(true);
    expect(insideReturnWindow("August 31, 2026")).toBe(false);
    expect(insideReturnWindow("October 1, 2026")).toBe(true);
  });

  it("refuses a delivery after today", () => {
    expect(() => returnWindowDay("October 2, 2026")).toThrow(RangeError);
  });
});

describe("late from (late-or-missing-packages.md: more than 2 business days past the estimate)", () => {
  it("is the third business day after the estimate", () => {
    // Monday October 5 → Thursday October 8.
    expect(lateFrom("October 5, 2026")).toBe("October 8, 2026");
  });

  it("skips weekends", () => {
    // Friday October 2: Monday 5 and Tuesday 6, so late on Wednesday 7 (AO-10570).
    expect(lateFrom("October 2, 2026")).toBe("October 7, 2026");
  });

  it("skips holidays: Columbus Day moves AO-10547 and AO-10561", () => {
    // Wednesday October 7: Thursday 8, Friday 9, Columbus Day on Monday 12, so Tuesday 13.
    expect(lateFrom(order("AO-10547").estimatedDelivery!)).toBe("October 13, 2026");
    // Thursday October 8: Friday 9, Tuesday 13, so Wednesday 14.
    expect(lateFrom(order("AO-10561").estimatedDelivery!)).toBe("October 14, 2026");
  });

  it("skips Veterans Day and Thanksgiving", () => {
    // Tuesday November 10: Veterans Day on Wednesday 11; Thursday 12, Friday 13, Monday 16.
    expect(lateFrom("November 10, 2026")).toBe("November 16, 2026");
    // Wednesday November 25: Thanksgiving on Thursday 26; Friday 27, Monday 30, Tuesday Dec 1.
    expect(lateFrom("November 25, 2026")).toBe("December 1, 2026");
  });
});

describe("warranty until (warranty.md: 1 year from the delivery date)", () => {
  it("is the delivery date one year on", () => {
    expect(warrantyUntil("September 1, 2026")).toBe("September 1, 2027");
    expect(warrantyUntil("August 12, 2026")).toBe("August 12, 2027");
  });
});

describe("orderFacts (spec §4.1: computed by code, never by the model)", () => {
  it("gives a delivered order its window day and its warranty", () => {
    expect(orderFacts(order("AO-10468"))).toEqual({
      changeable: false,
      returnWindow: { day: 9, of: 30, open: true },
      warrantyUntil: "September 22, 2027",
    });
    expect(orderFacts(order("AO-10351")).returnWindow).toEqual({ day: 30, of: 30, open: true });
    expect(orderFacts(order("AO-10307")).returnWindow).toEqual({ day: 36, of: 30, open: false });
  });

  it("gives a shipped order the day it becomes late, and says it is not late today", () => {
    expect(orderFacts(order("AO-10561"))).toEqual({
      changeable: false,
      lateFrom: "October 14, 2026",
      late: false,
    });
    expect(orderFacts(order("AO-10570"), "October 7, 2026")).toMatchObject({ late: true });
    expect(orderFacts(order("AO-10570"), "October 6, 2026")).toMatchObject({ late: false });
  });

  it("calls only a processing order changeable", () => {
    expect(orderFacts(order("AO-10583"))).toEqual({ changeable: true });
    expect(orderFacts(order("AO-10589"))).toEqual({ changeable: true });
  });

  it("gives a returned order no window and no warranty", () => {
    expect(orderFacts(order("AO-10326"))).toEqual({ changeable: false });
  });
});

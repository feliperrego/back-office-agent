import { isBusinessDay } from "@/lib/store/business-days";
import { storeData, type Order } from "@/lib/store/customers";
import { formatStoreDate, parseStoreDate } from "@/lib/store/dates";

/**
 * The dates the agent works with, computed by code and never by the model (spec §4.1): P1's run
 * 1 got this arithmetic wrong (P1's t17 advised waiting for a day already past). Pure and
 * client-safe.
 */

/** Today, P1's asOf: every write is dated with it (spec §3 B1). */
export const TODAY = storeData.asOf;

/** returns.md: "within 30 days of its delivery". */
export const RETURN_WINDOW_DAYS = 30;

/** late-or-missing-packages.md: late is "more than 2 business days past" the estimate. */
const LATE_AFTER_BUSINESS_DAYS = 2;

const DAY_MS = 86_400_000;

/**
 * Which day of the return window `today` is: the calendar days since the delivery, the delivery
 * day being day 0. Throws a RangeError for a delivery after today.
 */
export function returnWindowDay(deliveredOn: string, today: string = TODAY): number {
  const days = (parseStoreDate(today).getTime() - parseStoreDate(deliveredOn).getTime()) / DAY_MS;
  if (days < 0) throw new RangeError(`${deliveredOn} is after ${today}`);
  return days;
}

/** Whether a delivered item may still go back: day 30 is inside the window (spec §3 B10). */
export function insideReturnWindow(deliveredOn: string, today: string = TODAY): boolean {
  return returnWindowDay(deliveredOn, today) <= RETURN_WINDOW_DAYS;
}

/**
 * The first day a package is late: the third business day after its estimated delivery, since
 * business days skip weekends and US federal holidays (shipping-options.md).
 */
export function lateFrom(estimatedDelivery: string): string {
  let day = parseStoreDate(estimatedDelivery).getTime();
  let past = 0;
  while (past <= LATE_AFTER_BUSINESS_DAYS) {
    day += DAY_MS;
    if (isBusinessDay(formatStoreDate(new Date(day)))) past++;
  }
  return formatStoreDate(new Date(day));
}

/** The day the warranty ends: 1 year from the delivery date (warranty.md). */
export function warrantyUntil(deliveredOn: string): string {
  const delivered = parseStoreDate(deliveredOn);
  return formatStoreDate(
    new Date(
      Date.UTC(delivered.getUTCFullYear() + 1, delivered.getUTCMonth(), delivered.getUTCDate()),
    ),
  );
}

/** What code knows about an order on a given day, for readRequest (spec §4.1). */
export type OrderFacts = {
  /** Only a processing order's items or address may change (changing-or-canceling-an-order.md). */
  changeable: boolean;
  /** A delivered order's day in its return window. */
  returnWindow?: { day: number; of: number; open: boolean };
  /** A delivered order's last day of warranty. */
  warrantyUntil?: string;
  /** A shipped order's first late day, and whether it is late on `today`. */
  lateFrom?: string;
  late?: boolean;
};

export function orderFacts(order: Order, today: string = TODAY): OrderFacts {
  const facts: OrderFacts = { changeable: order.status === "processing" };
  if (order.status === "delivered" && order.deliveredOn) {
    const day = returnWindowDay(order.deliveredOn, today);
    facts.returnWindow = { day, of: RETURN_WINDOW_DAYS, open: day <= RETURN_WINDOW_DAYS };
    facts.warrantyUntil = warrantyUntil(order.deliveredOn);
  }
  if (order.status === "shipped" && order.estimatedDelivery) {
    facts.lateFrom = lateFrom(order.estimatedDelivery);
    facts.late = parseStoreDate(today).getTime() >= parseStoreDate(facts.lateFrom).getTime();
  }
  return facts;
}

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CUSTOMERS_PATH,
  ORDER_STATUSES,
  SHIPPING_METHODS,
  storeData,
  type Order,
  type OrderStatus,
  type StoreData,
} from "@/lib/store/customers";
import { BUSINESS_DAYS_FROM, BUSINESS_DAYS_TO, businessDaysAfter } from "@/lib/store/business-days";
import { parseStoreDate } from "@/lib/store/dates";

// P1's fictional customers (spec §2, P2-06), checked against the policies of spec §3, so an order
// never contradicts the help center the agent applies. Copied from P1's tests/customers.test.ts
// at f56063b (P2-25), and run on every store P2 can reach: the seed, and the seed after the
// agent's writes (spec §3 B3).

const DAY_MS = 86_400_000;
// Business days skip US federal holidays, as the shipping article says; lib/store/business-days.ts
// knows them for one year, and the date check below keeps every date inside it.
const FIRST_DAY = parseStoreDate(BUSINESS_DAYS_FROM).getTime();
const LAST_DAY = parseStoreDate(BUSINESS_DAYS_TO).getTime();

function cents(dollars: number): number {
  return Math.round(dollars * 100);
}

const ORDER_FIELDS = [
  "id",
  "placedOn",
  "status",
  "shippingMethod",
  "items",
  "subtotal",
  "shippingCost",
  "total",
  "shippedOn",
  "trackingNumber",
  "trackingUrl",
  "estimatedDelivery",
  "deliveredOn",
  "returnAuthorization",
  "returnReceivedOn",
  "refund",
];
const DATE_FIELDS = [
  "placedOn",
  "shippedOn",
  "estimatedDelivery",
  "deliveredOn",
  "returnReceivedOn",
] as const;

// The optional fields each status has, and those it may have; it has none of the others. P1's
// rule, plus a delivered order's return authorization (spec §3 B3), which only the agent writes.
const SHIPPED = ["shippedOn", "trackingNumber", "trackingUrl"];
const FIELDS_BY_STATUS: Record<OrderStatus, { has: string[]; mayHave: string[] }> = {
  processing: { has: [], mayHave: [] },
  shipped: { has: [...SHIPPED, "estimatedDelivery"], mayHave: [] },
  delivered: { has: [...SHIPPED, "deliveredOn"], mayHave: ["returnAuthorization"] },
  returned: { has: [...SHIPPED, "deliveredOn", "returnReceivedOn", "refund"], mayHave: [] },
};
const OPTIONAL_FIELDS = ORDER_FIELDS.slice(ORDER_FIELDS.indexOf("shippedOn"));

/** The seed with a return authorized on each order named, dated today, as B1 and B3 write it. */
function withReturnsAuthorized(ids: string[]): StoreData {
  const store = structuredClone(storeData);
  for (const order of store.customers.flatMap((customer) => customer.orders)) {
    if (!ids.includes(order.id)) continue;
    order.returnAuthorization = {
      authorizedOn: store.asOf,
      refundOnArrival: order.total,
      to: "original payment method",
      returnShippingPaidBy: "customer",
    };
  }
  return store;
}

const STORES: [string, StoreData][] = [
  ["data/customers.json", storeData],
  // AO-10468 is on day 9 of its window, AO-10351 on day 30, still inside it (spec §3 B10).
  [
    "the seed with returns authorized on AO-10468 and AO-10351",
    withReturnsAuthorized(["AO-10468", "AO-10351"]),
  ],
];

describe("data/customers.json (spec §2, P2-06)", () => {
  it("is P1's file at f56063b, byte for byte", () => {
    // `git show f56063b:data/customers.json | shasum -a 256` in support-assistant.
    expect(createHash("sha256").update(readFileSync(CUSTOMERS_PATH)).digest("hex")).toBe(
      "277e81c7f9089550d1840871ea23dd4779127af3d292ca2487c7b6ee637852ba",
    );
  });

  it("holds no return authorization: only the agent writes one", () => {
    const orders = storeData.customers.flatMap((customer) => customer.orders);
    expect(orders.filter((order) => "returnAuthorization" in order)).toEqual([]);
  });

  it("builds the store after two approved returns, so the checks below run on it too", () => {
    const [, [, authorized]] = STORES;
    const orders = authorized.customers.flatMap((customer) => customer.orders);
    expect(orders.filter((order) => order.returnAuthorization).map(({ id }) => id)).toEqual([
      "AO-10351",
      "AO-10468",
    ]);
  });
});

describe.each(STORES)("%s (spec §2, §3)", (_, store) => {
  const { customers } = store;
  const orders = customers.flatMap((customer) => customer.orders);

  it("holds 5 customers with their own ids, names and .example e-mails", () => {
    expect(customers).toHaveLength(5);
    for (const key of ["id", "name", "email"] as const) {
      const values = customers.map((customer) => customer[key]);
      expect(new Set(values).size, key).toBe(values.length);
    }
    for (const { id, email } of customers) {
      expect(id).toMatch(/^cus-\d{2}$/);
      expect(email).toMatch(/^[a-z.]+@[a-z]+\.example$/);
    }
    expect(store.currency).toBe("USD");
  });

  it("gives each customer 2 or 3 orders, with ids unique across the store", () => {
    for (const customer of customers) {
      expect(customer.orders.length, customer.id).toBeGreaterThanOrEqual(2);
      expect(customer.orders.length, customer.id).toBeLessThanOrEqual(3);
    }
    const ids = orders.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^AO-\d{5}$/);
  });

  it("covers every status of an order's life", () => {
    expect(new Set(orders.map(({ status }) => status))).toEqual(new Set(ORDER_STATUSES));
    for (const order of orders) expect(SHIPPING_METHODS, order.id).toContain(order.shippingMethod);
  });

  it("gives each status exactly its fields", () => {
    for (const order of orders) {
      for (const key of Object.keys(order)) expect(ORDER_FIELDS, order.id).toContain(key);
      const { has, mayHave } = FIELDS_BY_STATUS[order.status];
      const present = OPTIONAL_FIELDS.filter((field) => field in order && !mayHave.includes(field));
      expect(present, order.id).toEqual(has);
    }
  });

  it("writes every date as a store date inside the year the holiday list covers", () => {
    const dates = [
      store.asOf,
      ...orders.flatMap((order) => [
        ...DATE_FIELDS.flatMap((field) => order[field] ?? []),
        ...(order.refund ? [order.refund.issuedOn] : []),
        ...(order.returnAuthorization ? [order.returnAuthorization.authorizedOn] : []),
      ]),
    ];
    for (const date of dates) {
      const time = parseStoreDate(date).getTime();
      expect(time >= FIRST_DAY && time <= LAST_DAY, date).toBe(true);
    }
  });

  it("dates each order's steps in order, none after asOf except an estimated delivery", () => {
    const asOf = parseStoreDate(store.asOf).getTime();
    for (const order of orders) {
      const steps = [
        order.placedOn,
        order.shippedOn,
        order.deliveredOn,
        order.returnAuthorization?.authorizedOn,
        order.returnReceivedOn,
        order.refund?.issuedOn,
      ]
        .filter((date): date is string => date !== undefined)
        .map((date) => parseStoreDate(date).getTime());
      expect(steps, order.id).toEqual([...steps].sort((a, b) => a - b));
      expect(Math.max(...steps) <= asOf, order.id).toBe(true);
      if (order.estimatedDelivery) {
        expect(parseStoreDate(order.estimatedDelivery).getTime() > asOf, order.id).toBe(true);
      }
    }
  });

  it("adds up each order: items, shipping and total, in US dollars", () => {
    for (const order of orders) {
      expect(order.items.length, order.id).toBeGreaterThan(0);
      for (const { quantity, price } of order.items) {
        expect(Number.isInteger(quantity) && quantity > 0, order.id).toBe(true);
        expect(price > 0 && cents(price) === price * 100, order.id).toBe(true);
      }
      const items = order.items.reduce(
        (sum, { quantity, price }) => sum + quantity * cents(price),
        0,
      );
      expect(cents(order.subtotal), order.id).toBe(items);
      expect(cents(order.total), order.id).toBe(cents(order.subtotal) + cents(order.shippingCost));
    }
  });

  it("charges shipping as shipping-options.md says: standard free over $75, express $15", () => {
    for (const order of orders) {
      if (order.shippingMethod === "express") {
        expect(order.shippingCost, order.id).toBe(15);
      } else {
        // shipping-options.md sets no price for standard shipping under $75, so no order needs one.
        expect(order.subtotal, order.id).toBeGreaterThan(75);
        expect(order.shippingCost, order.id).toBe(0);
      }
    }
  });

  it("delivers in shipping-options.md's times: standard 5–7 business days, express 2", () => {
    const shipped = orders.filter((order): order is Order & { shippedOn: string } =>
      Boolean(order.shippedOn),
    );
    expect(shipped.length).toBeGreaterThan(0);
    for (const order of shipped) {
      const arrival = order.deliveredOn ?? order.estimatedDelivery;
      if (!arrival) throw new Error(`${order.id} has neither a delivery nor an estimate`);
      const days = businessDaysAfter(order.shippedOn, arrival);
      const [min, max] = order.shippingMethod === "express" ? [2, 2] : [5, 7];
      expect(days >= min && days <= max, `${order.id}: ${days} business days`).toBe(true);
    }
  });

  it("takes returns within 30 days of delivery and refunds them within 5 business days", () => {
    const returned = orders.filter((order) => order.status === "returned");
    expect(returned.length).toBeGreaterThan(0);
    for (const order of returned) {
      const { deliveredOn, returnReceivedOn, refund } = order;
      if (!deliveredOn || !returnReceivedOn || !refund)
        throw new Error(`${order.id} is incomplete`);
      const days =
        (parseStoreDate(returnReceivedOn).getTime() - parseStoreDate(deliveredOn).getTime()) /
        DAY_MS;
      expect(days, order.id).toBeLessThanOrEqual(30);
      expect(businessDaysAfter(returnReceivedOn, refund.issuedOn), order.id).toBeLessThanOrEqual(5);
      expect(refund.to, order.id).toBe("original payment method");
      // The whole order came back. The policies are silent on refunding shipping costs (spec §3
      // B4), so a returned order shipped free and its refund is its total.
      expect(order.shippingCost, order.id).toBe(0);
      expect(cents(refund.amount), order.id).toBe(cents(order.total));
    }
  });

  it("authorizes a return as spec §3 B3 says: today, inside the window, the total on arrival", () => {
    for (const order of orders.filter((item) => item.returnAuthorization)) {
      const { deliveredOn, returnAuthorization } = order;
      if (!deliveredOn || !returnAuthorization) throw new Error(`${order.id} is incomplete`);
      expect(Object.keys(returnAuthorization).sort(), order.id).toEqual([
        "authorizedOn",
        "refundOnArrival",
        "returnShippingPaidBy",
        "to",
      ]);
      // Every write is dated today (B1); day 30 after the delivery is inside the window (B10).
      expect(returnAuthorization.authorizedOn, order.id).toBe(store.asOf);
      const day =
        (parseStoreDate(returnAuthorization.authorizedOn).getTime() -
          parseStoreDate(deliveredOn).getTime()) /
        DAY_MS;
      expect(day >= 0 && day <= 30, `${order.id}: day ${day}`).toBe(true);
      // The whole order, its total (B3); a shipping refund goes to manual handling (B4), so an
      // authorized order shipped free.
      expect(order.shippingCost, order.id).toBe(0);
      expect(cents(returnAuthorization.refundOnArrival), order.id).toBe(cents(order.total));
      expect(returnAuthorization.to, order.id).toBe("original payment method");
      expect(returnAuthorization.returnShippingPaidBy, order.id).toBe("customer");
    }
  });

  it("gives each shipped order its own tracking number and a .example tracking link", () => {
    const numbers = orders.flatMap(({ trackingNumber }) => trackingNumber ?? []);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const order of orders.filter(({ trackingNumber }) => trackingNumber)) {
      expect(order.trackingNumber, order.id).toMatch(/^AOT\d{9}$/);
      expect(order.trackingUrl, order.id).toBe(
        `https://track.acmeoutfitters.example/${order.trackingNumber}`,
      );
    }
  });
});

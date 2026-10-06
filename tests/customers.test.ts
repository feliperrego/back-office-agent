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
} from "@/lib/store/customers";
import { BUSINESS_DAYS_FROM, BUSINESS_DAYS_TO, businessDaysAfter } from "@/lib/store/business-days";
import { parseStoreDate } from "@/lib/store/dates";

// P1's fictional customers (spec §2, P2-06), checked against the policies of spec §3, so an order
// never contradicts the help center the agent applies. Copied from P1's tests/customers.test.ts
// at f56063b (P2-25).
const { customers } = storeData;
const orders = customers.flatMap((customer) => customer.orders);

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

// The optional fields each status has; it has none of the others.
const SHIPPED = ["shippedOn", "trackingNumber", "trackingUrl"];
const FIELDS_BY_STATUS: Record<OrderStatus, string[]> = {
  processing: [],
  shipped: [...SHIPPED, "estimatedDelivery"],
  delivered: [...SHIPPED, "deliveredOn"],
  returned: [...SHIPPED, "deliveredOn", "returnReceivedOn", "refund"],
};
const OPTIONAL_FIELDS = ORDER_FIELDS.slice(ORDER_FIELDS.indexOf("shippedOn"));

describe("data/customers.json (spec §2, P2-06)", () => {
  it("is P1's file at f56063b, byte for byte", () => {
    // `git show f56063b:data/customers.json | shasum -a 256` in support-assistant.
    expect(createHash("sha256").update(readFileSync(CUSTOMERS_PATH)).digest("hex")).toBe(
      "277e81c7f9089550d1840871ea23dd4779127af3d292ca2487c7b6ee637852ba",
    );
  });

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
    expect(storeData.currency).toBe("USD");
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
      const present = OPTIONAL_FIELDS.filter((field) => field in order);
      expect(present, order.id).toEqual(FIELDS_BY_STATUS[order.status]);
    }
  });

  it("writes every date as a store date inside the year the holiday list covers", () => {
    const dates = [
      storeData.asOf,
      ...orders.flatMap((order) => [
        ...DATE_FIELDS.flatMap((field) => order[field] ?? []),
        ...(order.refund ? [order.refund.issuedOn] : []),
      ]),
    ];
    for (const date of dates) {
      const time = parseStoreDate(date).getTime();
      expect(time >= FIRST_DAY && time <= LAST_DAY, date).toBe(true);
    }
  });

  it("dates each order's steps in order, none after asOf except an estimated delivery", () => {
    const asOf = parseStoreDate(storeData.asOf).getTime();
    for (const order of orders) {
      const steps = [
        order.placedOn,
        order.shippedOn,
        order.deliveredOn,
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

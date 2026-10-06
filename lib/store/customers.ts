import data from "@/data/customers.json";

/**
 * The fictional customers and their orders: P1's store (support-assistant data/customers.json at
 * f56063b), copied unchanged (spec §2, P2-06, P2-25), 5 customers with 2–3 orders each. It is the
 * seed every request's sandbox starts from (spec §4.2). Every name, e-mail and order is invented;
 * e-mails and URLs use the reserved .example domain. Its `about` text is P1's and names P1's spec.
 * tests/customers.test.ts checks the data against the policies of spec §3.
 */
export const CUSTOMERS_PATH = "data/customers.json";

export const ORDER_STATUSES = ["processing", "shipped", "delivered", "returned"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SHIPPING_METHODS = ["standard", "express"] as const;
export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

/** Prices are US dollars. */
export type OrderItem = { name: string; variant?: string; quantity: number; price: number };

export type Refund = { amount: number; issuedOn: string; to: string };

/**
 * A return the back office authorized, P2's one addition to P1's store (spec §3 B3, P2-06, P2-08):
 * the whole order comes back, its total is refunded to the original payment method when the
 * return arrives, and the customer pays the return shipping. The status stays "delivered". Only
 * the agent's approved write adds one; the seed has none.
 */
export type ReturnAuthorization = {
  /** The day of the approval: today (spec §3 B1). */
  authorizedOn: string;
  /** US dollars: the order's total. */
  refundOnArrival: number;
  to: "original payment method";
  returnShippingPaidBy: "customer";
};

/**
 * One order. Dates are store dates (lib/store/dates.ts). Which optional fields an order has
 * follows from its status: tests/customers.test.ts pins the rule.
 */
export type Order = {
  id: string;
  placedOn: string;
  status: OrderStatus;
  shippingMethod: ShippingMethod;
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  total: number;
  shippedOn?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  /** Only while the order is on its way. */
  estimatedDelivery?: string;
  deliveredOn?: string;
  /** Only on a delivered order, inside its return window. */
  returnAuthorization?: ReturnAuthorization;
  /** The day a returned order arrived back at the warehouse. */
  returnReceivedOn?: string;
  refund?: Refund;
};

export type Customer = { id: string; name: string; email: string; orders: Order[] };

export type StoreData = {
  about: string;
  /** The day the data describes: no order changes after it. */
  asOf: string;
  currency: "USD";
  customers: Customer[];
};

export const storeData = data as StoreData;

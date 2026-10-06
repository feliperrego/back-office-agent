"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import { useId } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { codeWords } from "@/lib/approval/card-text";
import { format } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locale";
import type { Messages } from "@/lib/i18n/messages";
import type { HandOffReason } from "@/lib/sandbox/requests";
import { customerOf, type Sandbox } from "@/lib/sandbox/sandbox";
import type { Order } from "@/lib/store/customers";
import { formatStoreDay, formatUsd } from "@/lib/store/display";
import { cn } from "@/lib/utils";

/** What the page shows of a request: data/requests.json's record, and its customer's name. */
export type RequestView = {
  id: string;
  customer: string;
  reason: HandOffReason;
  /** P1's ticket and its conversation in P1's inbox, or null: written for this demo. */
  source: { ticket: string; href: string } | null;
  message: string;
  note: string;
};

/** The order's key day for its status, as its customer reads it. */
function orderDay(order: Order, t: Messages, locale: Locale): string | null {
  const day = (date: string | undefined, text: string) =>
    date === undefined ? null : format(text, { date: formatStoreDay(date, locale) });
  switch (order.status) {
    case "processing":
      return day(order.placedOn, t.request.placed);
    case "shipped":
      return day(order.estimatedDelivery, t.request.estimated);
    case "delivered":
      return day(order.deliveredOn, t.request.delivered);
    case "returned":
      return day(order.returnReceivedOn, t.request.returned);
  }
}

function OrderCard({ order, t, locale }: { order: Order; t: Messages; locale: Locale }) {
  const day = orderDay(order, t, locale);
  return (
    <li data-order={order.id} className="flex flex-col gap-1 rounded-lg border p-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-medium">{order.id}</span>
        <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
          {t.orderStatus[order.status]}
        </span>
      </div>
      {day !== null && <p className="text-xs text-muted-foreground">{day}</p>}
      {order.returnAuthorization !== undefined && (
        <p
          data-testid="return-authorized"
          className="text-xs font-medium text-emerald-700 dark:text-emerald-400"
        >
          {format(t.request.returnAuthorized, {
            amount: formatUsd(order.returnAuthorization.refundOnArrival, locale),
          })}
        </p>
      )}
      {/* The store's items are its English data (spec §4.6). */}
      <ul lang="en" className="flex flex-col text-xs">
        {order.items.map((item) => (
          <li key={item.name} data-item={item.name} className="wrap-anywhere">
            {item.name}
            {item.variant !== undefined && (
              <>
                {" · "}
                <span data-variant="">{item.variant}</span>
              </>
            )}{" "}
            {format(t.request.quantity, { n: item.quantity })}
          </li>
        ))}
      </ul>
      <p className="text-xs">
        {format(t.request.total, { amount: formatUsd(order.total, locale) })}
      </p>
    </li>
  );
}

/** A labelled piece of the customer's text: recorded English, data and never instructions. */
function Quote({ label, text }: { label: string; text: string }) {
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-xs font-medium text-muted-foreground">{label}</figcaption>
      <blockquote lang="en" className="border-l-2 pl-3 text-sm whitespace-pre-wrap wrap-anywhere">
        {text}
      </blockquote>
    </figure>
  );
}

/**
 * A request's pane (P2's spec §1 item 2, §3 B8): the request's status as this conversation leaves
 * it, P1's reason and where it came from, the customer's message and Support's note marked as
 * customer text, not instructions, the decision once a write closed it, and the customer's orders
 * as the sandbox has them now, so an approved change shows at once. Nothing persists: the pane
 * says so. On a phone it stacks above the agent panel, collapsed by default and again after the
 * first send, behind a 44 px toggle; from md up it is a column of its own and always open.
 */
export function RequestPane({
  request,
  sandbox,
  open,
  onToggle,
}: {
  request: RequestView;
  sandbox: Sandbox;
  /** Open on a phone; from md up it is always shown. */
  open: boolean;
  onToggle: () => void;
}) {
  const { locale, t } = useLocale();
  const titleId = useId();
  const contentId = useId();
  const state = sandbox.request;
  const orders = customerOf(sandbox).orders;
  return (
    <aside
      aria-labelledby={titleId}
      data-testid="request-pane"
      className="flex shrink-0 flex-col border-b md:w-80 md:overflow-y-auto md:border-r md:border-b-0 lg:w-96"
    >
      <div className="flex items-center gap-2 px-4 py-2">
        <h2 id={titleId} className="min-w-0 flex-1 font-semibold wrap-anywhere">
          {format(t.request.title, { id: request.id })}
          <span className="font-normal text-muted-foreground">
            {" · "}
            {request.customer}
          </span>
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden pointer-coarse:size-11"
          aria-expanded={open}
          aria-controls={contentId}
          aria-label={open ? t.request.hide : t.request.show}
          onClick={onToggle}
        >
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </div>
      <div
        id={contentId}
        data-testid="request-details"
        className={cn(
          open ? "flex" : "hidden",
          "flex-col gap-4 px-4 pb-4 max-md:max-h-[45dvh] max-md:overflow-y-auto md:flex",
        )}
      >
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t.request.status}</dt>
          <dd data-testid="request-status" data-status={state.status} className="font-medium">
            {t.lanes[state.status]}
          </dd>
        </dl>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
            {t.reasons[request.reason]}
          </span>
          {request.source === null ? (
            <span className="text-muted-foreground">{t.board.forDemo}</span>
          ) : (
            <a
              href={request.source.href}
              aria-label={format(t.board.fromSupportLabel, { ticket: request.source.ticket })}
              className="inline-flex items-center gap-1 text-muted-foreground underline underline-offset-4 pointer-coarse:min-h-11"
            >
              {format(t.board.fromSupport, { ticket: request.source.ticket })}
              <ExternalLink className="size-3 shrink-0" />
            </a>
          )}
        </div>
        <section className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">{t.request.customerText}</p>
          <Quote label={t.request.message} text={request.message} />
          <Quote label={t.request.note} text={request.note} />
        </section>
        {state.status !== "open" && state.code !== null && (
          <section data-testid="request-decision" className="flex flex-col gap-1 text-sm">
            <p className="text-xs font-medium text-muted-foreground">{t.request.decision}</p>
            <p className="font-medium">{codeWords(state.code, t)}</p>
            {state.note !== null && (
              <p lang="en" className="text-muted-foreground wrap-anywhere">
                {state.note}
              </p>
            )}
          </section>
        )}
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">{t.request.orders}</h3>
          <ul className="flex flex-col gap-2">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} t={t} locale={locale} />
            ))}
          </ul>
        </section>
        <p className="text-xs text-muted-foreground">{t.request.resets}</p>
      </div>
    </aside>
  );
}

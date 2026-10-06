"use client";

import { CircleCheck, CircleX, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { BoardCard, BoardData } from "@/lib/board/board";
import { evalsHeadline, type EvalsViewData } from "@/lib/eval/view";
import { formatNumber } from "@/lib/i18n/display";
import { format } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locale";
import type { Messages } from "@/lib/i18n/messages";
import type { RequestStatus } from "@/lib/sandbox/sandbox";
import { cn } from "@/lib/utils";

const TARGET = "pointer-coarse:min-h-11 inline-flex items-center";

// The Board's links never prefetch (Next's prefetch={false}: neither in view nor on hover): its
// many request pages would be fetched as they scroll into view, a change of language included,
// for pages that load fast anyway.

/** Where a request came from: P1's ticket, linked to its conversation, or this demo. */
function Provenance({ card, t }: { card: BoardCard; t: Messages }) {
  if (card.source === null || card.sourceHref === null) {
    return <span className="text-muted-foreground">{t.board.forDemo}</span>;
  }
  return (
    <a
      href={card.sourceHref}
      aria-label={format(t.board.fromSupportLabel, { ticket: card.source })}
      className={cn(TARGET, "gap-1 text-muted-foreground underline underline-offset-4")}
    >
      {format(t.board.fromSupport, { ticket: card.source })}
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

/**
 * A real run's verdict on the card's case, linked to its page; nothing on a mock run. Its name
 * starts with the verdict it shows, then says where it goes (WCAG 2.5.3, label in name).
 */
function Mark({ card, t }: { card: BoardCard; t: Messages }) {
  if (card.mark === null) return null;
  const { matched, expected, caseHref } = card.mark;
  const verdict = matched
    ? t.board.matched
    : format(t.board.notMatched, { lane: t.lanes[expected] });
  return (
    <Link
      prefetch={false}
      href={caseHref}
      data-matched={matched}
      aria-label={format(t.board.markLabel, { verdict, id: card.id })}
      className={cn(
        TARGET,
        "gap-1 font-medium underline-offset-4 hover:underline",
        matched ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
      )}
    >
      {matched ? <CircleCheck className="size-3.5" /> : <CircleX className="size-3.5" />}
      {verdict}
    </Link>
  );
}

function Card({ card, t }: { card: BoardCard; t: Messages }) {
  return (
    <article
      data-request={card.id}
      className="flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card p-3 text-sm shadow-xs"
    >
      {/* The link keeps its name on one line (it never shrinks, up to the card's width); the
          reason chip moves under it when both do not fit, and wraps its own words if it must. */}
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <Link
          prefetch={false}
          href={card.href}
          aria-label={format(t.board.openRequest, { id: card.id, customer: card.customer })}
          className={cn(
            TARGET,
            "max-w-full shrink-0 gap-2 font-medium underline-offset-4 hover:underline",
          )}
        >
          <span className="font-mono text-xs text-muted-foreground">{card.id}</span>
          <span className="wrap-anywhere">{card.customer}</span>
        </Link>
        <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
          {t.reasons[card.reason]}
        </span>
      </div>
      <p className="font-mono text-xs">{card.orderId ?? t.board.noOrder}</p>
      <p lang="en" className="line-clamp-2 text-muted-foreground">
        {card.note}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 text-xs">
        <Provenance card={card} t={t} />
        <Mark card={card} t={t} />
      </div>
    </article>
  );
}

function Lane({
  id,
  cards,
  t,
  locale,
}: {
  id: RequestStatus;
  cards: BoardCard[];
  t: Messages;
  locale: Locale;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      data-lane={id}
      className="flex min-w-0 flex-col gap-2 rounded-xl bg-muted/50 p-2"
    >
      <h3 id={headingId} className="flex items-baseline justify-between gap-2 px-1 font-semibold">
        {t.lanes[id]}
        <span
          data-testid="lane-count"
          className="rounded-full bg-background px-2 text-xs font-normal text-muted-foreground tabular-nums"
        >
          {formatNumber(cards.length, locale)}
        </span>
      </h3>
      {cards.length === 0 ? (
        <p className="px-1 pb-1 text-sm text-muted-foreground">{t.board.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cards.map((card) => (
            <li key={card.id}>
              <Card card={card} t={t} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The Board (P2's spec §1, P2-03, P2-04, P2-05): the run's headline, as the Evals page states it
 * (a mock run's statement that it measures nothing, X2-04), then the five lanes, each card a
 * request: its id and customer, linked to its page, P1's reason, the order or "No order given",
 * Support's note in two lines (recorded English), where it came from, and on a real run whether
 * it ended as its case expects. The lanes stack on a phone and sit side by side on a wide screen.
 */
export function BoardView({
  board,
  evals,
  evalsHref,
}: {
  board: BoardData;
  evals: EvalsViewData;
  evalsHref: string;
}) {
  const { locale, t } = useLocale();
  const shown = evalsHeadline(evals, t, locale);
  return (
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">{t.board.title}</h2>
        <p className="max-w-3xl text-muted-foreground">{t.board.intro}</p>
      </div>
      <section aria-labelledby="board-headline" className="flex flex-col gap-1">
        <p
          id="board-headline"
          data-testid="board-headline"
          className={cn("font-semibold tracking-tight", board.mock ? "text-lg" : "text-2xl")}
        >
          {shown.headline}
        </p>
        {shown.interval !== null && <p className="text-muted-foreground">{shown.interval}</p>}
        <Link
          prefetch={false}
          href={evalsHref}
          className={cn(TARGET, "w-fit text-sm underline underline-offset-4")}
        >
          {t.board.measured}
        </Link>
      </section>
      <p data-testid="board-note" className="text-sm text-muted-foreground">
        {board.mock ? t.board.mockNote : t.board.realNote}
      </p>
      <div
        data-testid="lanes"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      >
        {board.lanes.map((lane) => (
          <Lane key={lane.id} id={lane.id} cards={lane.cards} t={t} locale={locale} />
        ))}
      </div>
    </div>
  );
}

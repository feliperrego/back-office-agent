"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useId } from "react";
import { usePageTitle } from "@/components/app-shell/use-page-title";
import { useLocale } from "@/components/i18n/locale-provider";
import { VerdictBadge } from "@/components/trace/blocks";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { evalsHeadline, type EvalsViewData, supportingText } from "@/lib/eval/view";
import { formatDay, formatNumber, formatSeconds } from "@/lib/i18n/display";
import { format } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import { RunLabelView } from "./run-label";

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-lg font-semibold tabular-nums">{value}</span>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <h3 id={id} className="text-lg font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * The Evals page (template spec §5.12), in fixed sections: the run's label, the headline, the
 * groups, the supporting data, one row per case linking to its page, and the run's details.
 * Every number comes from the run's file (lib/eval/view.ts). A mock run shows a statement that it
 * measures nothing, with its pass counts, and no rate, interval, method, latency or token count.
 * It names the browser tab in the interface language (usePageTitle).
 */
export function EvalsView({ data }: { data: EvalsViewData }) {
  const { locale, t } = useLocale();
  usePageTitle((t) => t.evals.title);
  const shown = evalsHeadline(data, t, locale);
  const { measured, details } = data;
  const seconds = (ms: number) => format(t.trace.seconds, { n: formatSeconds(ms, locale) });

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-10 px-4 py-8">
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">{t.evals.title}</h2>
        <RunLabelView run={data.run} />
      </div>

      <section aria-labelledby="headline" className="flex flex-col gap-2">
        <p
          id="headline"
          data-testid="headline"
          className={cn("font-semibold tracking-tight", measured === null ? "text-xl" : "text-3xl")}
        >
          {shown.headline}
        </p>
        {shown.interval !== null && (
          <p data-testid="interval" className="text-lg text-muted-foreground">
            {shown.interval}
          </p>
        )}
        {shown.passed !== null && <p>{shown.passed}</p>}
        <p className="max-w-3xl text-sm text-muted-foreground">{data.about[locale]}</p>
      </section>

      <Section title={t.evals.byGroup}>
        <div data-testid="groups" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {data.groups.map((group) => (
            <Stat
              key={group.id}
              label={group.label[locale]}
              value={format(t.evals.ofTotal, { n: group.passed, total: group.cases })}
            />
          ))}
        </div>
      </Section>

      {measured !== null && (
        <Section title={t.evals.supporting}>
          <div data-testid="supporting" className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {measured.supporting.map((row) => (
              <Stat
                key={row.label.en}
                label={row.label[locale]}
                value={supportingText(row.value, t, locale)}
              />
            ))}
          </div>
        </Section>
      )}

      <Section title={t.evals.cases}>
        <Table data-testid="cases">
          <TableHeader>
            <TableRow>
              <TableHead>{t.evals.case}</TableHead>
              <TableHead>{t.evals.group}</TableHead>
              <TableHead>{t.trace.result}</TableHead>
              {measured !== null && (
                <>
                  <TableHead className="text-right">{t.trace.latency}</TableHead>
                  <TableHead className="text-right">{t.trace.usage}</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row) => (
              <TableRow key={row.id} data-case={row.id}>
                <TableCell>
                  <Link
                    href={row.href}
                    aria-label={format(t.evals.open, { id: row.id })}
                    className="font-mono underline underline-offset-4 pointer-coarse:inline-block pointer-coarse:py-3"
                  >
                    {row.id}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-normal">{row.group[locale]}</TableCell>
                <TableCell>
                  <VerdictBadge pass={row.pass} />
                </TableCell>
                {row.measured !== null && (
                  <>
                    <TableCell className="text-right tabular-nums">
                      {seconds(row.measured.latencyMs)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.measured.totalTokens === null
                        ? t.trace.notReported
                        : formatNumber(row.measured.totalTokens, locale)}
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title={t.evals.details}>
        <dl
          data-testid="details"
          className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]"
        >
          <dt className="text-muted-foreground">{t.evals.date}</dt>
          <dd>{formatDay(data.run.date, locale)}</dd>
          <dt className="text-muted-foreground">{t.evals.model}</dt>
          <dd className="font-mono wrap-anywhere">{data.run.model}</dd>
          {data.run.commit !== null && (
            <>
              <dt className="text-muted-foreground">{t.evals.commit}</dt>
              <dd className="font-mono">
                {data.run.commit}
                {data.run.dirty && <> {t.run.dirty}</>}
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">{t.evals.caseSet}</dt>
          <dd className="wrap-anywhere">
            {format(t.evals.frozen, {
              n: details.caseSet.n,
              date: formatDay(`${details.caseSet.frozenOn}T00:00:00.000Z`, locale),
            })}
            {" · "}
            <span className="font-mono text-xs">
              {format(t.evals.sha256, { hash: details.caseSet.sha256.slice(0, 12) })}
            </span>
          </dd>
          {shown.method !== null && (
            <>
              <dt className="text-muted-foreground">{t.evals.method}</dt>
              <dd>{shown.method}</dd>
            </>
          )}
          <dt className="text-muted-foreground">{t.evals.rawData}</dt>
          <dd>
            <a
              href={details.rawDataHref}
              className="inline-flex items-center gap-1 font-mono text-xs underline underline-offset-4 wrap-anywhere pointer-coarse:py-3"
            >
              {details.file}
              <ExternalLink className="size-3.5 shrink-0" />
            </a>
          </dd>
        </dl>
      </Section>
    </div>
  );
}

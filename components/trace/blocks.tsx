"use client";

import { CircleCheck, CircleX } from "lucide-react";
import type { ReactNode } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatSeconds } from "@/lib/i18n/display";
import { format } from "@/lib/i18n/format";
import type { ToolView } from "@/lib/trace/tool-view";
import type { Check, TokenUsage } from "@/lib/trace/trace";
import { cn } from "@/lib/utils";
import { ToolCallList } from "./tool-call";

/**
 * The blocks of an answer's trace (template spec §5.10): its tool calls, its tokens and latency,
 * and the checks an eval scored it by, with the verdict. A page puts them in the order it needs.
 * A project's own words (a check's label) come in as props; the shell's come from its keys.
 */

/** A titled block of the trace. */
export function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** Label and value rows. */
export function Facts({ rows }: { rows: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="wrap-anywhere">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The pass/fail badge of an answer an eval scored. data-verdict is what the e2e reads. Both
 * texts are a darker shade than their tint, for AA contrast at 12 px: the destructive variant's
 * own text color gives about 4:1 on its tint.
 */
export function VerdictBadge({ pass, className }: { pass: boolean; className?: string }) {
  const { t } = useLocale();
  return (
    <Badge
      variant={pass ? "secondary" : "destructive"}
      data-verdict={pass ? "pass" : "fail"}
      className={cn(pass ? "bg-emerald-600/10 text-emerald-700" : "text-red-700", className)}
    >
      {pass ? <CircleCheck /> : <CircleX />}
      {pass ? t.trace.pass : t.trace.fail}
    </Badge>
  );
}

/** The tool calls of an answer that is over, such as a recorded one, each as its chip. */
export function ToolCallsBlock({ calls }: { calls: readonly ToolView[] }) {
  const { t } = useLocale();
  return (
    <Block title={t.trace.toolCalls}>
      {calls.length === 0 ? (
        <p className="text-muted-foreground">{t.trace.noToolCalls}</p>
      ) : (
        <ToolCallList views={calls} streaming={false} />
      )}
    </Block>
  );
}

/** The answer's tokens over every model call, then its latency; what nobody reported says so. */
export function UsageBlock({
  usage,
  latencyMs,
}: {
  usage: TokenUsage | null;
  latencyMs: number | null;
}) {
  const { locale, t } = useLocale();
  const tokens = (count: number | null | undefined) =>
    count == null ? t.trace.notReported : formatNumber(count, locale);
  return (
    <Block title={t.trace.usage}>
      <div data-testid="usage">
        <Facts
          rows={[
            [t.trace.inputTokens, tokens(usage?.inputTokens)],
            [t.trace.outputTokens, tokens(usage?.outputTokens)],
            [t.trace.totalTokens, tokens(usage?.totalTokens)],
            [
              t.trace.latency,
              latencyMs === null
                ? t.trace.notReported
                : format(t.trace.seconds, { n: formatSeconds(latencyMs, locale) }),
            ],
          ]}
        />
      </div>
    </Block>
  );
}

/**
 * The verdict, then why: each check the answer was scored by, named by the project
 * (`checkLabel`), with the data behind a failure.
 */
export function ChecksBlock({
  pass,
  checks,
  checkLabel,
}: {
  pass: boolean;
  checks: readonly Check[];
  checkLabel: (id: string) => string;
}) {
  const { t } = useLocale();
  return (
    <Block title={t.trace.result}>
      <div>
        <VerdictBadge pass={pass} />
      </div>
      <h4 className="mt-2 text-sm font-medium">{t.trace.why}</h4>
      <ul data-testid="checks" className="flex flex-col gap-1.5">
        {checks.map((check) => (
          <li key={check.id} data-check={check.id} data-ok={check.ok} className="flex gap-2">
            {check.ok ? (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            ) : (
              <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" />
            )}
            <span className="flex min-w-0 flex-col gap-1">
              <span>
                {checkLabel(check.id)}{" "}
                <span className="sr-only">
                  {check.ok ? t.trace.checkHolds : t.trace.checkFails}
                </span>
              </span>
              {check.detail !== undefined && check.detail.length > 0 && (
                <span lang="en" className="flex flex-wrap gap-1">
                  {check.detail.map((detail) => (
                    <code
                      key={detail}
                      className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs wrap-anywhere"
                    >
                      {detail}
                    </code>
                  ))}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Block>
  );
}

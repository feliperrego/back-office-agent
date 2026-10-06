"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePageTitle } from "@/components/app-shell/use-page-title";
import { useLocale } from "@/components/i18n/locale-provider";
import { Block, ChecksBlock, ToolCallsBlock, UsageBlock } from "@/components/trace/blocks";
import type { CaseViewData } from "@/lib/eval/view";
import { format } from "@/lib/i18n/format";
import { RunLabelView } from "./run-label";

/**
 * One case of the shown run (template spec §5.12): its question and recorded answer, then its
 * trace (template spec §5.10): the verdict and each check, the tool calls as chips, and the
 * tokens and latency. A mock run measures no tokens and no latency, so its usage block says so
 * instead of showing the mock's figures. The question and the answer are recorded English text,
 * marked lang="en". It names the browser tab in the interface language (usePageTitle).
 */
export function CaseView({ data }: { data: CaseViewData }) {
  const { locale, t } = useLocale();
  usePageTitle((t) => format(t.evals.caseTitle, { id: data.id }));
  const checkLabel = (id: string) => data.checkLabels[id]?.[locale] ?? id;

  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-8 px-4 py-8">
      <div className="flex flex-col gap-3">
        <Link
          href={data.evalsHref}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline pointer-coarse:min-h-11"
        >
          <ArrowLeft className="size-4 shrink-0" />
          {t.evals.allCases}
        </Link>
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            {format(t.evals.caseTitle, { id: data.id })}
          </h2>
          <p className="text-sm text-muted-foreground">{data.group[locale]}</p>
        </div>
        <RunLabelView run={data.run} />
      </div>

      {data.exchange !== null && (
        <div data-testid="exchange" className="flex flex-col gap-4">
          <Block title={t.evals.question}>
            <p lang="en" className="whitespace-pre-wrap wrap-anywhere">
              {data.exchange.question}
            </p>
          </Block>
          <Block title={t.evals.answer}>
            <p lang="en" className="whitespace-pre-wrap wrap-anywhere">
              {data.exchange.answer}
            </p>
          </Block>
        </div>
      )}

      <div data-testid="trace" className="flex flex-col gap-6 text-sm">
        <ChecksBlock pass={data.pass} checks={data.checks} checkLabel={checkLabel} />
        <ToolCallsBlock calls={data.toolCalls} />
        {data.measured === null ? (
          <Block title={t.trace.usage}>
            <p data-testid="usage" className="text-muted-foreground">
              {t.evals.mockUsage}
            </p>
          </Block>
        ) : (
          <UsageBlock usage={data.measured.usage} latencyMs={data.measured.latencyMs} />
        )}
      </div>
    </div>
  );
}

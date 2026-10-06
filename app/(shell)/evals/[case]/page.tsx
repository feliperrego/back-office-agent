import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CaseView } from "@/components/evals/case-view";
import { EVALS_PAGE, type SampleResult } from "@/lib/eval/project";
import { readShownRun } from "@/lib/eval/runs";
import { caseView } from "@/lib/eval/view";
import { format } from "@/lib/i18n/format";
import { messages } from "@/lib/i18n/messages";

// One page per case of the shown run, built at build time; any other id is a 404 and never reads
// measurements/ at request time (template spec §5.12).
export const dynamicParams = false;

export function generateStaticParams() {
  return readShownRun().run.results.map(({ id }) => ({ case: id }));
}

// The served title is English, as the page is; CaseView sets it in the visitor's language.
export async function generateMetadata({ params }: PageProps<"/evals/[case]">): Promise<Metadata> {
  const { case: id } = await params;
  return { title: format(messages.en.evals.caseTitle, { id }) };
}

/** A case of the shown run and its trace (template spec §5.12), linked from the Evals page. */
export default async function Case({ params }: PageProps<"/evals/[case]">) {
  const { case: id } = await params;
  const data = caseView(readShownRun<SampleResult>(), id, EVALS_PAGE);
  if (data === null) notFound();
  return <CaseView data={data} />;
}

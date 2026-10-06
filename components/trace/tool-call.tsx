"use client";

import {
  Ban,
  ChevronDown,
  CircleAlert,
  CircleDashed,
  Hourglass,
  LoaderCircle,
  Wrench,
} from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toolLabel } from "@/lib/i18n/messages";
import type { ShellMessages } from "@/lib/i18n/shell-messages";
import { settledViews, type ToolState, type ToolView } from "@/lib/trace/tool-view";

/**
 * A tool's input or output as JSON: data, in English as the tools return it, so it is marked
 * lang="en". It wraps, so a long value never widens the page on a phone.
 */
export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre
      lang="en"
      className="max-h-60 overflow-y-auto rounded-md bg-muted/60 p-2 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere"
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** A call's input, then its output or its error. */
export function ToolCallData({ view }: { view: ToolView }) {
  const { t } = useLocale();
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">{t.toolCall.input}</p>
      <JsonBlock value={view.input ?? {}} />
      {view.state === "done" && (
        <>
          <p className="text-xs font-medium text-muted-foreground">{t.toolCall.output}</p>
          <JsonBlock value={view.output} />
        </>
      )}
      {view.state === "error" && (
        <>
          <p className="text-xs font-medium text-destructive">{t.toolCall.error}</p>
          <JsonBlock value={view.error} />
        </>
      )}
    </div>
  );
}

/** What the chip says after its label: nothing for a finished call. */
function stateWords(state: ToolState, t: ShellMessages): string | null {
  switch (state) {
    case "running":
      return t.toolCall.running;
    case "awaiting-approval":
      return t.toolCall.awaitingApproval;
    case "error":
      return t.toolCall.failed;
    case "denied":
      return t.toolCall.denied;
    case "interrupted":
      return t.toolCall.interrupted;
    case "done":
      return null;
  }
}

function StateIcon({ state }: { state: ToolState }) {
  switch (state) {
    case "running":
      return (
        <LoaderCircle className="size-4 shrink-0 text-muted-foreground motion-safe:animate-spin" />
      );
    case "awaiting-approval":
      return <Hourglass className="size-4 shrink-0 text-muted-foreground" />;
    case "error":
      return <CircleAlert className="size-4 shrink-0 text-destructive" />;
    case "denied":
      return <Ban className="size-4 shrink-0 text-muted-foreground" />;
    case "interrupted":
      return <CircleDashed className="size-4 shrink-0 text-muted-foreground" />;
    case "done":
      return <Wrench className="size-4 shrink-0 text-muted-foreground" />;
  }
}

/**
 * A tool chip (template spec §5.10): the call, named in the project's words (toolLabel), its
 * state, and on a click its input and output. data-tool and data-tool-state are what the e2e
 * reads.
 */
export function ToolCall({ view }: { view: ToolView }) {
  const { t } = useLocale();
  const words = stateWords(view.state, t);
  return (
    <Collapsible
      data-tool={view.name}
      data-tool-state={view.state}
      className="rounded-lg border text-sm"
    >
      <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11">
        <StateIcon state={view.state} />
        <span className="min-w-0 flex-1 wrap-anywhere">{toolLabel(view, t)}</span>
        {words !== null && (
          <span
            className={
              view.state === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"
            }
          >
            {words}
          </span>
        )}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-2.5 py-2">
        <ToolCallData view={view} />
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * The chips of an answer's tool calls, in order. Once the answer no longer streams, a call still
 * running was cut off and shows as not finished (settledViews), never as spinning.
 */
export function ToolCallList({
  views,
  streaming,
}: {
  views: readonly ToolView[];
  /** The answer is still streaming. */
  streaming: boolean;
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {(streaming ? views : settledViews(views)).map((view) => (
        <li key={view.id}>
          <ToolCall view={view} />
        </li>
      ))}
    </ul>
  );
}

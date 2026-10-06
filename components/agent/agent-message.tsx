"use client";

import type { UIMessage } from "ai";
import type { ReactNode } from "react";
import { ApprovalCard } from "@/components/approval/approval-card";
import type { ApprovalAnswer } from "@/components/chat/message-list";
import { useLocale } from "@/components/i18n/locale-provider";
import { ToolCall } from "@/components/trace/tool-call";
import { cardText, denialWords } from "@/lib/approval/card-text";
import { callItems, type CallItem, type CallOutcome } from "@/lib/approval/tool-calls";
import { format } from "@/lib/i18n/format";
import { toolLabel, type Messages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locale";
import { describeCall } from "@/lib/sandbox/card";
import type { Sandbox } from "@/lib/sandbox/sandbox";
import { messageText } from "@/lib/trace/message-text";
import { settledViews } from "@/lib/trace/tool-view";

type AgentMessageProps = {
  message: UIMessage;
  /** Still streaming, or answered and about to continue: a running call is not cut off yet. */
  streaming: boolean;
  /** The caption row (Stopped, Cut, Regenerate), or null; it goes last. */
  caption: ReactNode;
  respond: (answer: ApprovalAnswer) => void;
  canRespond: boolean;
  /** The request's sandbox as the conversation leaves it: what a waiting write would change. */
  sandbox: Sandbox;
  /**
   * The mock model answers (Preview, CI): its text is English whatever the interface language,
   * so it is marked lang="en"; the real model answers in the interface language (spec §4.6).
   */
  isMock: boolean;
};

/** A decided write's result line: who decided, or the policy gate's reason. */
function outcomeText(outcome: CallOutcome, t: Messages): string {
  switch (outcome.kind) {
    case "applied":
      return t.approval.applied;
    case "rejected":
      return t.approval.rejected;
    case "blocked":
      return outcome.code === null
        ? t.approval.blockedPlain
        : format(t.approval.blocked, { reason: denialWords(outcome.code, t) });
  }
}

/** The card of a write that waits for the person, in the interface language. */
function PendingCard({
  item,
  approvalId,
  sandbox,
  respond,
  canRespond,
  t,
  locale,
}: {
  item: CallItem;
  approvalId: string;
  sandbox: Sandbox;
  respond: (answer: ApprovalAnswer) => void;
  canRespond: boolean;
  t: Messages;
  locale: Locale;
}) {
  const { call } = item.card!;
  const title = toolLabel(item.view, t, sandbox.request.id);
  const described = describeCall(call, sandbox);
  // The server's gate let it through, so the browser's agrees; if it ever did not, the card says
  // why, and the server decides again on the answer's continuation (spec §4.2).
  const text = described.allowed
    ? cardText(call.toolName, described.card, t, locale)
    : {
        rows: [],
        lines: [
          {
            label: t.approval.policy,
            text: format(t.approval.blocked, { reason: denialWords(described.code, t) }),
          },
        ],
        note: undefined,
      };
  return (
    <ApprovalCard
      eyebrow={t.status.approvalNeeded}
      title={title}
      rows={text.rows}
      lines={text.lines}
      note={text.note}
      approveLabel={t.approval.approve}
      rejectLabel={t.approval.reject}
      disabled={!canRespond}
      onApprove={() => respond({ id: approvalId, approved: true })}
      onReject={() => respond({ id: approvalId, approved: false })}
    />
  );
}

/**
 * P2's assistant renderer (P2's spec §1 item 3, §4.4, P2-21; W-P19's text first kept, spec §9):
 * the answer's text, then each tool call in order, as the shell's chip (template spec §5.10),
 * except a write that waits for the person, which is the approval card, standing under the same
 * data-tool; under a decided write, its result line ("Applied · approved by you", "Rejected by
 * you", "Blocked by policy: …"); the caption last. It keeps the renderer contract (template spec
 * §5.8): data-message-role="assistant" on the root, the text as its first child div, even while
 * empty, and the caption last. Once the answer no longer streams, a call still running shows as
 * not finished, as the shell's chips do. A read's and a decision's card and chip name the page's
 * request before their output does (spec §4.1); the mock's English text is marked lang="en".
 */
export function AgentMessage({
  message,
  streaming,
  caption,
  respond,
  canRespond,
  sandbox,
  isMock,
}: AgentMessageProps) {
  const { locale, t } = useLocale();
  const items = callItems(message);
  const views = streaming
    ? items.map(({ view }) => view)
    : settledViews(items.map(({ view }) => view));
  return (
    <div data-message-role="assistant" className="flex flex-col gap-2">
      <div lang={isMock ? "en" : undefined} className="whitespace-pre-wrap wrap-anywhere">
        {messageText(message)}
      </div>
      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((item, index) => {
            const view = views[index];
            return (
              <li key={view.id}>
                {item.card !== null ? (
                  <div data-tool={view.name} data-tool-state={view.state}>
                    <PendingCard
                      item={item}
                      approvalId={item.card.approvalId}
                      sandbox={sandbox}
                      respond={respond}
                      canRespond={canRespond}
                      t={t}
                      locale={locale}
                    />
                  </div>
                ) : (
                  <>
                    <ToolCall view={view} label={toolLabel(view, t, sandbox.request.id)} />
                    {item.outcome !== null && (
                      <p
                        data-approval-result={item.outcome.kind}
                        className="px-2.5 pt-1 text-xs text-muted-foreground"
                      >
                        {outcomeText(item.outcome, t)}
                      </p>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {caption}
    </div>
  );
}

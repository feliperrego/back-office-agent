"use client";

import { Check, X } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";

/** A before → after row; `lang` marks a row of data in another language than the page's. */
export type ApprovalRow = { label: string; value: string; lang?: string };

/** A line under the rows: its label, then its text. */
export type ApprovalLine = { label: string; text: string; lang?: string };

export type ApprovalCardProps = {
  /** Above the title, such as "Approval needed". */
  eyebrow: string;
  /** What the call does, as its chip names it, such as "Return authorization: AO-10468". */
  title: string;
  rows: readonly ApprovalRow[];
  /** Lines under the rows, such as the policy check and what needs the person's judgement. */
  lines?: readonly ApprovalLine[];
  /** The agent's own words, shown smaller. */
  note?: ApprovalLine;
  approveLabel: string;
  rejectLabel: string;
  /** No answer would go now, such as while the chat is busy: both buttons wait. */
  disabled: boolean;
  onApprove: () => void;
  onReject: () => void;
};

/**
 * The approval card (P2's spec §4.4, P2-10, P2-22): what a write will change, as before → after
 * rows, the lines a person reads before deciding, the agent's own words smaller, and Approve or
 * Reject. It holds no words of its own: a project's renderer passes them, built from the call's
 * typed input and never from the model's prose, so P4 can reuse it (ROADMAP line 53; X-03 moves
 * it into the shell). No edit and no typed reason. The rows stack on a phone and sit side by side
 * from sm up; the buttons are 44 px tall and full width on a phone.
 */
export function ApprovalCard({
  eyebrow,
  title,
  rows,
  lines = [],
  note,
  approveLabel,
  rejectLabel,
  disabled,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      data-approval-card=""
      className="flex flex-col gap-3 rounded-lg border-2 border-primary/30 bg-card p-3 text-sm"
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-xs font-medium text-muted-foreground">{eyebrow}</p>
        <h3 id={titleId} className="font-semibold wrap-anywhere">
          {title}
        </h3>
      </div>
      {rows.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-4 sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)] sm:gap-y-1">
          {rows.map((row, index) => (
            <div key={index} lang={row.lang} className="contents">
              <dt className="text-muted-foreground wrap-anywhere">{row.label}</dt>
              <dd className="mb-2 font-medium wrap-anywhere sm:mb-0">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {lines.map((line, index) => (
        <div key={index} className="flex flex-col gap-0.5">
          <p className="text-xs font-medium text-muted-foreground">{line.label}</p>
          <p lang={line.lang} className="wrap-anywhere">
            {line.text}
          </p>
        </div>
      ))}
      {note !== undefined && (
        <p className="text-xs text-muted-foreground wrap-anywhere">
          {note.label}
          <br />
          <span lang={note.lang}>{note.text}</span>
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="min-h-11 w-full sm:w-auto" disabled={disabled} onClick={onApprove}>
          <Check />
          {approveLabel}
        </Button>
        <Button
          variant="outline"
          className="min-h-11 w-full sm:w-auto"
          disabled={disabled}
          onClick={onReject}
        >
          <X />
          {rejectLabel}
        </Button>
      </div>
    </section>
  );
}

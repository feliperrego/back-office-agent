import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { isWriteTool, type ProposedCall } from "@/lib/sandbox/calls";
import { DENIAL_CODES, deniedCodeOf, type DenialCode } from "@/lib/sandbox/sandbox";
import { toolViewsOf, type ToolView } from "@/lib/trace/tool-view";

/**
 * What P2's renderer shows for each tool call of an answer (P2's spec §1 item 3, §4.4): the
 * shell's chip for each call, except a write that waits for the person, which shows as the
 * approval card; and under a decided write its result line. It reads the parts as AI SDK 7.0.114
 * leaves them (ai dist/index.d.ts, UIToolInvocation): a person's answer keeps the approval on the
 * part through its end; the gate's own decision carries isAutomatic and its code as the reason; a
 * re-check that overrides an approval on a continuation streams only the denial, with no reason;
 * a write the sandbox refused when it ran is a tool error whose text holds its code. Pure and
 * client-safe.
 */

/** Where a decided write ended, for its result line. */
export type CallOutcome =
  | { kind: "applied" }
  | { kind: "rejected" }
  /** The policy gate refused it; with its code when the stream gave one. */
  | { kind: "blocked"; code: DenialCode | null };

export type CallItem = {
  /** The call as the shell's chip shows it. */
  view: ToolView;
  /** A write waiting for the person: the approval id its answer takes, and the call. */
  card: { approvalId: string; call: ProposedCall } | null;
  /** A decided write's end; null for the read, and for a write still running or waiting. */
  outcome: CallOutcome | null;
};

type ToolPart = Extract<UIMessage["parts"][number], { toolCallId: string }>;
type Approval = { id: string; approved?: boolean; isAutomatic?: boolean; reason?: string };

function approvalOf(part: ToolPart): Approval | undefined {
  return "approval" in part ? (part.approval ?? undefined) : undefined;
}

function denialCode(reason: string | undefined): DenialCode | null {
  return reason !== undefined && (DENIAL_CODES as readonly string[]).includes(reason)
    ? (reason as DenialCode)
    : null;
}

function outcomeOf(part: ToolPart, approval: Approval | undefined): CallOutcome | null {
  const byPerson = approval !== undefined && approval.isAutomatic !== true;
  switch (part.state) {
    case "output-available":
      return byPerson && approval.approved === true ? { kind: "applied" } : null;
    case "approval-responded":
      return byPerson && approval.approved === false ? { kind: "rejected" } : null;
    case "output-denied":
      if (byPerson && approval.approved === false) return { kind: "rejected" };
      // The gate's own denial, with its code; or a re-check that overrode the person's approval.
      return {
        kind: "blocked",
        code: denialCode(approval?.isAutomatic ? approval.reason : undefined),
      };
    case "output-error": {
      const code = deniedCodeOf(part.errorText);
      return code === null ? null : { kind: "blocked", code };
    }
    default:
      return null;
  }
}

/** The answer's tool calls, in order, as P2's renderer shows them. */
export function callItems(message: UIMessage): CallItem[] {
  const views = toolViewsOf(message);
  const parts = message.parts.filter(isToolUIPart) as ToolPart[];
  return parts.map((part, index) => {
    const view = views[index];
    const name = getToolName(part);
    if (!isWriteTool(name)) return { view, card: null, outcome: null };
    const approval = approvalOf(part);
    const waiting =
      part.state === "approval-requested" && approval !== undefined && !approval.isAutomatic;
    return {
      view,
      card: waiting
        ? {
            approvalId: approval.id,
            call: { toolCallId: part.toolCallId, toolName: name, input: part.input },
          }
        : null,
      outcome: outcomeOf(part, approval),
    };
  });
}

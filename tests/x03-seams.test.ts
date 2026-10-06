import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// P2-21 and spec §9's X-03 row: the template's files P2 changed on purpose (the approval seams,
// the history whitelist, the card, the banner link, the case page's labelled texts), which X-03
// moves into the shell when P2 ships, before P4 starts. This list is the record in the repo (the
// review's m17): for each file, the seams X-03 takes and the tests that own them. Each file says
// "X-03" where it changes the template, so a reader of the file finds the list from there.

type Seam = { seams: string[]; tests: string[] };

const X03: Record<string, Seam> = {
  "lib/chat/ui.ts": {
    seams: [
      "pendingApprovals",
      "awaitsApproval",
      "holdsApproval",
      "retryAction",
      "continuesAutomatically",
      "regenerateSlot",
      "approvalNeeded",
    ],
    tests: ["lib/chat/ui.test.ts"],
  },
  "components/chat/chat.tsx": {
    seams: [
      "sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses",
      "addToolApprovalResponse",
      "ChatHeaderActions",
      "approvalNotice",
      "onMessagesChange",
      "retryFailed",
      "continuing",
    ],
    tests: ["components/chat/chat.test.ts", "e2e/approval.spec.ts"],
  },
  "components/chat/message-list.tsx": {
    seams: ["respond", "canRespond", "ApprovalAnswer"],
    tests: ["components/chat/plain-text-message.test.ts", "e2e/approval.spec.ts"],
  },
  "components/chat/composer.tsx": {
    seams: ["readOnlyNotice"],
    tests: ["components/chat/composer.test.ts"],
  },
  "lib/i18n/shell-messages.ts": {
    seams: ["approvalNeeded"],
    tests: ["lib/i18n/messages.test.ts"],
  },
  "components/app-shell/app-shell.tsx": {
    seams: ["bannerLink"],
    tests: ["components/app-shell/banner.test.ts", "e2e/board.spec.ts"],
  },
  "components/app-shell/banner.ts": {
    seams: ["bannerParts"],
    tests: ["components/app-shell/banner.test.ts"],
  },
  "components/approval/approval-card.tsx": {
    seams: ["ApprovalCard", "ApprovalRow", "ApprovalLine"],
    tests: ["components/approval/approval-card.test.ts", "e2e/approval.spec.ts"],
  },
  "lib/chat/validate.ts": {
    seams: ["validateAndClean"],
    tests: ["lib/chat/validate.test.ts", "tests/api-chat-route.test.ts"],
  },
  "components/trace/tool-call.tsx": {
    seams: ["label?: string"],
    tests: ["components/agent/agent-message.test.ts", "e2e/approval.spec.ts"],
  },
  "lib/eval/view.ts": {
    seams: ["Exchange", "notes"],
    tests: ["lib/eval/project.test.ts", "e2e/evals.spec.ts"],
  },
  "components/evals/case-view.tsx": {
    seams: ["exchange-note-label"],
    tests: ["e2e/evals.spec.ts"],
  },
  // Project-owned, but it repeats the shell's collectUIMessage (lib/eval/run.ts) so that it can
  // continue a message, which the shell's cannot.
  "lib/eval/project.ts": {
    seams: ["continueAnswer"],
    tests: ["lib/eval/project.test.ts"],
  },
};

describe("X-03's list of P2's changes to the template", () => {
  it.each(Object.entries(X03))("%s says X-03 and holds its seams", (file, { seams, tests }) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain("X-03");
    for (const seam of seams) expect(source, seam).toContain(seam);
    for (const test of tests) expect(existsSync(test), test).toBe(true);
  });
});

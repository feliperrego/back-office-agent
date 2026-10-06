import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApprovalCard, type ApprovalCardProps } from "./approval-card";

// The approval card (P2's spec §4.4, P2-10, P2-22): generic, so P4 can reuse it (ROADMAP line
// 53), holding no store words: its title, rows, lines, note and button labels come in through
// props. Before → after rows that stack on a phone, the lines under them, the agent's note
// smaller, and Approve / Reject as 44 px targets, full width on a phone. No edit and no typed
// reason. Vitest runs in node with no DOM, so these tests read the server render; the clicks are
// e2e/approval.spec.ts's.

const PROPS: ApprovalCardProps = {
  eyebrow: "Approval needed",
  title: "Return authorization: AO-10468",
  rows: [
    { label: "Return", value: "— → Authorized" },
    { label: "Acme Loft Insulated Jacket", value: "Men's M, Black → Men's L, Black", lang: "en" },
  ],
  lines: [
    { label: "Policy check", text: "day 9 of 30" },
    { label: "Needs your judgement", text: "Unused, with tags" },
  ],
  note: { label: "Agent's reason", text: "Doesn't fit.", lang: "en" },
  approveLabel: "Approve",
  rejectLabel: "Reject",
  disabled: false,
  onApprove: () => {},
  onReject: () => {},
};

const render = (props: Partial<ApprovalCardProps> = {}) =>
  renderToStaticMarkup(createElement(ApprovalCard, { ...PROPS, ...props }));

const buttons = (markup: string) => markup.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? [];

describe("ApprovalCard", () => {
  it("is a region named by its title, under its eyebrow", () => {
    const markup = render();
    const labelledBy = /<section[^>]*aria-labelledby="([^"]+)"/.exec(markup)?.[1];
    expect(labelledBy).toBeDefined();
    expect(markup).toMatch(new RegExp(`<h3 id="${labelledBy}"[^>]*>${PROPS.title}</h3>`));
    expect(markup.indexOf(PROPS.eyebrow)).toBeLessThan(markup.indexOf(PROPS.title));
    expect(markup).toContain("data-approval-card");
  });

  it("shows each row as a term and its value, one column on a phone and two from sm up", () => {
    const markup = render();
    const list = /<dl class="([^"]+)"/.exec(markup)?.[1] ?? "";
    expect(list.split(" ")).toContain("grid-cols-1");
    expect(list).toMatch(/\bsm:grid-cols-\[/);
    expect(markup).toMatch(/<dt[^>]*>Return<\/dt><dd[^>]*>— → Authorized<\/dd>/);
    // A row of store data is marked English, label and value.
    expect(markup).toMatch(
      /<div lang="en"[^>]*><dt[^>]*>Acme Loft Insulated Jacket<\/dt><dd[^>]*>Men&#x27;s M, Black → Men&#x27;s L, Black<\/dd><\/div>/,
    );
  });

  it("shows each line's label, then its text, and the agent's note smaller, in its language", () => {
    const markup = render();
    expect(markup).toMatch(/Policy check<\/p><p[^>]*>day 9 of 30<\/p>/);
    expect(markup).toMatch(/Needs your judgement<\/p><p[^>]*>Unused, with tags<\/p>/);
    expect(markup).toMatch(/<p class="[^"]*text-xs[^"]*"[^>]*>Agent&#x27;s reason/);
    expect(markup).toMatch(/<span lang="en">Doesn&#x27;t fit\.<\/span>/);
  });

  it("offers Approve then Reject, each a 44 px target, full width on a phone", () => {
    const [approve, reject] = buttons(render());
    expect(approve).toContain(">Approve<");
    expect(reject).toContain(">Reject<");
    for (const button of [approve, reject]) {
      const classes = /class="([^"]+)"/.exec(button ?? "")?.[1].split(" ") ?? [];
      expect(classes).toContain("min-h-11");
      expect(classes).toContain("w-full");
      expect(classes).toContain("sm:w-auto");
      // The attribute, not the disabled: variants in the class list.
      expect(button ?? "").not.toMatch(/\sdisabled=""/);
    }
    expect(buttons(render())).toHaveLength(2);
  });

  it("disables both buttons while an answer cannot go", () => {
    for (const button of buttons(render({ disabled: true }))) {
      expect(button).toMatch(/\sdisabled=""/);
    }
  });

  it("leaves out the rows and the note when it has none", () => {
    const markup = render({ rows: [], note: undefined });
    expect(markup).not.toContain("<dl");
    expect(markup).not.toContain("Agent&#x27;s reason");
  });
});

import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Composer } from "@/components/chat/composer";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { shellMessages } from "@/lib/i18n/shell-messages";

// The composer's read-only state (template spec §5.8; P2's spec §4.5, P2-11): at the message cap,
// and while a card waits for the person's answer, the textarea stays focusable but takes no text,
// and a line above it, tied to it by aria-describedby, says why. Vitest runs in node with no DOM,
// so these tests read the server render.

const t = shellMessages.en;
const WAITING = "Approve or reject the card above";

function render(readOnlyNotice: string | null): string {
  return renderToStaticMarkup(
    createElement(
      LocaleProvider,
      null,
      createElement(Composer, {
        inputRef: createRef<HTMLTextAreaElement>(),
        busy: false,
        readOnlyNotice,
        composing: { current: false },
        onSend: () => false,
        onStop: () => {},
      }),
    ),
  );
}

const textarea = (markup: string) => markup.match(/<textarea[^>]*>/)?.[0] ?? "";
const attribute = (tag: string, name: string) =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

describe("the composer", () => {
  it("takes text, with its placeholder and no notice, when nothing holds it", () => {
    const markup = render(null);
    const input = textarea(markup);
    expect(input).not.toMatch(/\sreadonly/i);
    expect(attribute(input, "aria-disabled")).toBeNull();
    expect(attribute(input, "aria-describedby")).toBeNull();
    expect(attribute(input, "placeholder")).toBe(t.composer.placeholder);
  });

  it.each([
    ["at the message cap", t.composer.capNotice],
    ["while a card waits", WAITING],
  ])("%s is read-only, says why above it, and ties the line to it", (_, notice) => {
    const markup = render(notice);
    const input = textarea(markup);
    // React writes the attribute as readOnly="".
    expect(input).toMatch(/\sreadonly=""/i);
    expect(attribute(input, "aria-disabled")).toBe("true");
    expect(attribute(input, "placeholder")).toBeNull();
    const describedBy = attribute(input, "aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(markup).toContain(`<p id="${describedBy}"`);
    expect(markup).toMatch(new RegExp(`<p id="${describedBy}"[^>]*>${notice}</p>`));
    // The line comes before the textarea, so it reads first.
    expect(markup.indexOf(notice)).toBeLessThan(markup.indexOf("<textarea"));
    // Send stays disabled, whatever the draft holds.
    expect(markup).toMatch(
      new RegExp(
        `<button[^>]*disabled=""[^>]*aria-label="${t.composer.send}"|<button[^>]*aria-label="${t.composer.send}"[^>]*disabled=""`,
      ),
    );
  });
});

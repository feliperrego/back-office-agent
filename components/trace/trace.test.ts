import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { messages, toolLabel } from "@/lib/i18n/messages";
import { shellMessages } from "@/lib/i18n/shell-messages";
import type { ToolState, ToolView } from "@/lib/trace/tool-view";
import type { Check } from "@/lib/trace/trace";
import { ChecksBlock, ToolCallsBlock, UsageBlock, VerdictBadge } from "./blocks";
import { JsonBlock, ToolCall, ToolCallData, ToolCallList } from "./tool-call";

// The tool chip and the trace blocks (template spec §5.10). Vitest runs in node with no DOM
// (template spec §7.2), so these tests read the server render, the English prerender: what each
// part shows, not what a click does. A tool's label comes from the project's toolLabel, so the
// expected label is computed through it, never written here.

const T = shellMessages.en;

function render(element: ReactElement): string {
  return renderToStaticMarkup(createElement(LocaleProvider, null, element));
}

/** The text of a markup, tags dropped and entities of the JSON blocks decoded. */
function text(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}

function view(state: ToolState, fields: Partial<ToolView> = {}): ToolView {
  return { id: "call-1", name: "sampleTool", input: { itemId: "ITM-0042" }, state, ...fields };
}

const DONE = view("done", { output: { found: true, item: { name: "Brass desk lamp" } } });

describe("ToolCall", () => {
  it("shows the project's label for the call, with the data attributes the e2e reads", () => {
    const markup = render(createElement(ToolCall, { view: DONE }));
    expect(markup).toContain('data-tool="sampleTool"');
    expect(markup).toContain('data-tool-state="done"');
    expect(text(markup)).toContain(toolLabel(DONE, messages.en));
  });

  it.each([
    ["running", T.toolCall.running],
    ["awaiting-approval", T.toolCall.awaitingApproval],
    ["error", T.toolCall.failed],
    ["denied", T.toolCall.denied],
    ["interrupted", T.toolCall.interrupted],
  ] as const)("says a %s call's state next to its label", (state, words) => {
    const markup = render(createElement(ToolCall, { view: view(state) }));
    expect(markup).toContain(`data-tool-state="${state}"`);
    expect(text(markup)).toContain(words);
  });

  it("says nothing more for a finished call", () => {
    const shown = text(render(createElement(ToolCall, { view: DONE })));
    for (const words of [
      T.toolCall.running,
      T.toolCall.awaitingApproval,
      T.toolCall.failed,
      T.toolCall.denied,
      T.toolCall.interrupted,
    ]) {
      expect(shown).not.toContain(words);
    }
  });

  it("spins only while a call runs", () => {
    expect(render(createElement(ToolCall, { view: view("running") }))).toContain("animate-spin");
    for (const state of ["awaiting-approval", "done", "error", "denied", "interrupted"] as const) {
      expect(render(createElement(ToolCall, { view: view(state) }))).not.toContain("animate-spin");
    }
  });

  it("starts closed: its input and output show only once it is opened", () => {
    const shown = text(render(createElement(ToolCall, { view: DONE })));
    expect(shown).not.toContain(T.toolCall.input);
    expect(shown).not.toContain("Brass desk lamp");
  });

  it("is a button that grows to a 44 px target on a touch screen", () => {
    expect(render(createElement(ToolCall, { view: DONE }))).toMatch(
      /<button[^>]*class="[^"]*pointer-coarse:min-h-11/,
    );
  });
});

describe("ToolCallData", () => {
  it("shows the input, then the output of a finished call", () => {
    const shown = text(render(createElement(ToolCallData, { view: DONE })));
    expect(shown.indexOf(T.toolCall.input)).toBeLessThan(shown.indexOf(T.toolCall.output));
    expect(shown).toContain('"itemId": "ITM-0042"');
    expect(shown).toContain('"name": "Brass desk lamp"');
    expect(shown).not.toContain(T.toolCall.error);
  });

  it("shows the input, then the error of a failed call", () => {
    const failed = view("error", { error: "The item service is down." });
    const shown = text(render(createElement(ToolCallData, { view: failed })));
    expect(shown).toContain(T.toolCall.error);
    expect(shown).toContain('"The item service is down."');
    expect(shown).not.toContain(T.toolCall.output);
  });

  it.each(["running", "awaiting-approval", "denied", "interrupted"] as const)(
    "shows only the input of a %s call",
    (state) => {
      const shown = text(render(createElement(ToolCallData, { view: view(state) })));
      expect(shown).toContain('"itemId": "ITM-0042"');
      expect(shown).not.toContain(T.toolCall.output);
      expect(shown).not.toContain(T.toolCall.error);
    },
  );

  it("shows an input that has not streamed yet as an empty object", () => {
    const shown = text(
      render(createElement(ToolCallData, { view: view("running", { input: undefined }) })),
    );
    expect(shown).toContain("{}");
  });
});

describe("JsonBlock", () => {
  // Tools return data in English; the pt-BR scan of the e2e skips what is marked lang="en".
  it("prints the value as indented JSON, marked as English", () => {
    const markup = render(createElement(JsonBlock, { value: { a: [1, "two"] } }));
    expect(markup).toMatch(/^<pre lang="en"/);
    expect(text(markup)).toBe('{\n  "a": [\n    1,\n    "two"\n  ]\n}');
  });
});

describe("ToolCallList", () => {
  it("lists one chip per call, in order", () => {
    const markup = render(
      createElement(ToolCallList, {
        views: [DONE, view("running", { id: "call-2", name: "otherTool" })],
        streaming: true,
      }),
    );
    expect(markup).toMatch(/^<ul/);
    expect(markup.match(/data-tool="(\w+)"/g)).toEqual([
      'data-tool="sampleTool"',
      'data-tool="otherTool"',
    ]);
  });

  it("spins a running call while the answer streams", () => {
    const markup = render(createElement(ToolCallList, { views: [view("running")], streaming: true }));
    expect(markup).toContain('data-tool-state="running"');
    expect(markup).toContain("animate-spin");
  });

  // A Stop, an error or a timeout leaves the call's part as it was (template spec §5.10).
  it("shows a call still running once the answer is over as not finished, with no spinner", () => {
    const markup = render(
      createElement(ToolCallList, { views: [view("running"), DONE], streaming: false }),
    );
    expect(markup.match(/data-tool-state="([\w-]+)"/g)).toEqual([
      'data-tool-state="interrupted"',
      'data-tool-state="done"',
    ]);
    expect(markup).not.toContain("animate-spin");
    expect(text(markup)).toContain(T.toolCall.interrupted);
    expect(text(markup)).not.toContain(T.toolCall.running);
  });
});

describe("UsageBlock", () => {
  it("shows the tokens and the latency, in the interface language's number format", () => {
    const markup = render(
      createElement(UsageBlock, {
        usage: { inputTokens: 1200, outputTokens: 80, totalTokens: 1280 },
        latencyMs: 1834,
      }),
    );
    expect(markup).toContain('data-testid="usage"');
    const shown = text(markup);
    expect(shown).toContain(T.trace.usage);
    expect(shown).toContain(`${T.trace.inputTokens}1,200`);
    expect(shown).toContain(`${T.trace.outputTokens}80`);
    expect(shown).toContain(`${T.trace.totalTokens}1,280`);
    expect(shown).toContain(`${T.trace.latency}1.8 s`);
  });

  it("says a count or a latency nobody reported is not reported", () => {
    const partial = text(
      render(
        createElement(UsageBlock, {
          usage: { inputTokens: null, outputTokens: 80, totalTokens: null },
          latencyMs: null,
        }),
      ),
    );
    expect(partial).toContain(`${T.trace.inputTokens}${T.trace.notReported}`);
    expect(partial).toContain(`${T.trace.latency}${T.trace.notReported}`);
    const none = text(render(createElement(UsageBlock, { usage: null, latencyMs: null })));
    expect(none.split(T.trace.notReported)).toHaveLength(5);
  });
});

describe("ToolCallsBlock", () => {
  it("says so when no tool was called", () => {
    const shown = text(render(createElement(ToolCallsBlock, { calls: [] })));
    expect(shown).toContain(T.trace.toolCalls);
    expect(shown).toContain(T.trace.noToolCalls);
  });

  it("shows a chip for each call", () => {
    const markup = render(createElement(ToolCallsBlock, { calls: [DONE] }));
    expect(markup).toContain('data-tool="sampleTool"');
    expect(text(markup)).not.toContain(T.trace.noToolCalls);
  });

  // The block shows an answer that is over, such as a recorded one: nothing in it still runs.
  it("never spins: a call recorded as running shows as not finished", () => {
    const markup = render(createElement(ToolCallsBlock, { calls: [view("running")] }));
    expect(markup).toContain('data-tool-state="interrupted"');
    expect(markup).not.toContain("animate-spin");
  });
});

describe("ChecksBlock", () => {
  const checks: Check[] = [
    { id: "called-the-tool", ok: true },
    { id: "named-the-item", ok: false, detail: ["ITM-0042", "Brass desk lamp"] },
  ];
  const checkLabel = (id: string) => `Label of ${id}`;

  it("shows the verdict, then each check with its project label and its state for screen readers", () => {
    const markup = render(createElement(ChecksBlock, { pass: false, checks, checkLabel }));
    expect(markup).toContain('data-verdict="fail"');
    expect(markup).toContain('data-testid="checks"');
    expect(markup).toMatch(/data-check="called-the-tool" data-ok="true"/);
    expect(markup).toMatch(/data-check="named-the-item" data-ok="false"/);
    const shown = text(markup);
    expect(shown).toContain(T.trace.result);
    expect(shown).toContain(T.trace.why);
    expect(shown).toContain(`Label of called-the-tool ${T.trace.checkHolds}`);
    expect(shown).toContain(`Label of named-the-item ${T.trace.checkFails}`);
    expect(markup).toMatch(/class="sr-only">\(holds\)</);
  });

  // A failure's data is data, in English: the pt-BR scan skips it.
  it("shows a failed check's detail as data marked English", () => {
    const markup = render(createElement(ChecksBlock, { pass: false, checks, checkLabel }));
    expect(markup).toMatch(
      /<span lang="en"[^>]*><code[^>]*>ITM-0042<\/code><code[^>]*>Brass desk lamp<\/code><\/span>/,
    );
  });
});

describe("VerdictBadge", () => {
  it("says passed or failed, with the attribute the e2e reads", () => {
    const pass = render(createElement(VerdictBadge, { pass: true }));
    const fail = render(createElement(VerdictBadge, { pass: false }));
    expect(pass).toContain('data-verdict="pass"');
    expect(text(pass)).toBe(T.trace.pass);
    expect(fail).toContain('data-verdict="fail"');
    expect(text(fail)).toBe(T.trace.fail);
  });

  // WCAG 2.2 AA (1.4.3): the badge's 12 px text needs 4.5:1 against the badge's own background,
  // a tint laid over the page's white. The colors are the ones its classes name, read from the
  // theme, so a class or a theme value that drops below AA fails here.
  it.each([true, false])("with pass %s, has text at AA contrast on its own background", (pass) => {
    const classes = classOf(render(createElement(VerdictBadge, { pass })));
    // text-xs names a size, not a color: only names the theme holds a color for count.
    const textColors = classes
      .map((name) => /^text-([a-z]+(?:-\d+)?)$/.exec(name)?.[1])
      .filter((name) => name !== undefined && isThemeColor(name));
    const backgrounds = classes.flatMap((name) => {
      const parts = /^bg-([a-z]+(?:-\d+)?)\/(\d+)$/.exec(name);
      return parts === null ? [] : [{ color: parts[1], alpha: Number(parts[2]) / 100 }];
    });
    expect(textColors, classes.join(" ")).toHaveLength(1);
    expect(backgrounds, classes.join(" ")).toHaveLength(1);
    const page = srgb(themeColor("background"));
    const badge = over(srgb(themeColor(backgrounds[0].color)), backgrounds[0].alpha, page);
    const ratio = contrast(srgb(themeColor(textColors[0]!)), badge);
    expect(ratio, `${classes.join(" ")}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});

/** The class names of a markup's first element. */
function classOf(markup: string): string[] {
  return (/^<[^>]* class="([^"]*)"/.exec(markup)?.[1] ?? "").split(/\s+/);
}

const GLOBALS_CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const TAILWIND_THEME = readFileSync(
  join(process.cwd(), "node_modules/tailwindcss/theme.css"),
  "utf8",
);

/**
 * The light theme's value of a color utility's name, as oklch [L, C, h]: the template's own
 * tokens (app/globals.css, `--color-x: var(--x)` and `:root`'s `--x`) or Tailwind's palette.
 */
function themeColor(name: string): [number, number, number] {
  const token = new RegExp(`--color-${name}: var\\(--([\\w-]+)\\)`).exec(GLOBALS_CSS)?.[1];
  const root = /:root \{([^}]*)\}/.exec(GLOBALS_CSS)?.[1] ?? "";
  const value =
    token !== undefined
      ? new RegExp(`--${token}: (oklch\\([^)]*\\))`).exec(root)?.[1]
      : new RegExp(`--color-${name}: (oklch\\([^)]*\\))`).exec(TAILWIND_THEME)?.[1];
  const parts = /oklch\(([\d.]+)(%?) ([\d.]+) ([\d.]+)\)/.exec(value ?? "");
  if (parts === null) throw new Error(`no oklch value for the color ${name}`);
  const lightness = Number(parts[1]) / (parts[2] === "%" ? 100 : 1);
  return [lightness, Number(parts[3]), Number(parts[4])];
}

function isThemeColor(name: string): boolean {
  try {
    themeColor(name);
    return true;
  } catch {
    return false;
  }
}

/** oklch to gamma-encoded sRGB channels in [0, 1] (Björn Ottosson's OKLab matrices), clipped. */
function srgb([lightness, chroma, hue]: [number, number, number]): number[] {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((c) => {
    const clipped = Math.min(1, Math.max(0, c));
    return clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055;
  });
}

/** A color at `alpha` laid over another, as a browser composites them. */
function over(color: number[], alpha: number, below: number[]): number[] {
  return color.map((c, i) => alpha * c + (1 - alpha) * below[i]);
}

/** The WCAG contrast ratio of two sRGB colors. */
function contrast(first: number[], second: number[]): number {
  const luminance = (color: number[]) => {
    const [r, g, b] = color.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { LOCALES } from "@/lib/i18n/locale";

// The repo's files and imports, for the tests that guard the shell's boundaries (X-01 design §6).
// Paths are posix and relative to the repo root, as git prints them.

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** TypeScript and JavaScript sources. */
export const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

/**
 * Every file of the repo: the tracked ones and the new ones git does not ignore, so a new file is
 * checked before it is staged. Files deleted from the working tree are left out.
 */
export function repoFiles(): string[] {
  const listed = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return [...new Set(listed.split("\0"))]
    .filter((file) => file !== "" && existsSync(path.join(ROOT, file)))
    .sort();
}

export function readRepoFile(file: string): string {
  return readFileSync(path.join(ROOT, file), "utf8");
}

/**
 * The shell-owned files that stay in every project (X-01 design §4.1): i18n, the site header with
 * its server-only values, and the footer. Every file under components/i18n/ is shell too.
 */
export const I18N_SHELL_FILES = [
  "components/i18n/language-switch.tsx",
  "components/i18n/locale-provider.tsx",
  "components/site-header.tsx",
  "components/footer.tsx",
  "lib/i18n/display.ts",
  "lib/i18n/format.ts",
  "lib/i18n/locale.ts",
  "lib/i18n/localized.ts",
  "lib/i18n/shell-messages.ts",
  "lib/site-header.ts",
];

/**
 * The shell-owned chat files (X-01 design §4.1), which the removal recipe deletes (X-01 design
 * §5). Every file under components/chat/ is shell too.
 */
export const CHAT_SHELL_FILES = [
  "components/chat/chat.tsx",
  "components/chat/composer.tsx",
  "components/chat/empty-state.tsx",
  "components/chat/message-list.tsx",
  "components/chat/plain-text-message.tsx",
  "hooks/use-stick-to-bottom.ts",
  "lib/chat/config.ts",
  "lib/chat/errors.ts",
  "lib/chat/ui.ts",
  "lib/chat/validate.ts",
];

/**
 * The shell-owned files of the mock model, which stay in every project (template spec §5.2): how
 * a step streams and the step machine. The project's cues and answers, lib/ai/mock-scenarios.ts,
 * are project-owned.
 */
export const MOCK_SHELL_FILES = ["lib/ai/mock.ts", "lib/ai/mock-steps.ts"];

/**
 * The shell-owned files of the trace, which stay in every project (template spec §5.10): the tool
 * view, the trace's metadata and checks, the tool chip and the trace blocks. Every file under
 * components/trace/ and lib/trace/ is shell too.
 */
export const TRACE_SHELL_FILES = [
  "components/trace/blocks.tsx",
  "components/trace/tool-call.tsx",
  "lib/trace/message-text.ts",
  "lib/trace/tool-view.ts",
  "lib/trace/trace.ts",
];

/**
 * The shell-owned files of the eval core, which stay in every project (template spec §5.11): the
 * script and the modules it runs. Every file under lib/eval/ is shell too, but the project's own
 * module, lib/eval/project.ts, and its test.
 */
export const EVAL_SHELL_FILES = [
  "lib/eval/cases.ts",
  "lib/eval/check.ts",
  "lib/eval/command.ts",
  "lib/eval/readme.ts",
  "lib/eval/record.ts",
  "lib/eval/run.ts",
  "lib/eval/runs.ts",
  "lib/eval/stats.ts",
  "lib/eval/summary.ts",
  "scripts/eval.ts",
];

/**
 * The shell-owned files of the app shell and the Evals pages, which stay in every project
 * (template spec §5.12): the frame and its nav, the Evals page, a case's page, the run's label and
 * the view model they read. Every file under components/app-shell/ and components/evals/ is shell
 * too. The pages and the layout under app/(shell)/ are the project's.
 */
export const APP_SHELL_FILES = [
  "components/app-shell/app-shell.tsx",
  "components/app-shell/nav.ts",
  "components/app-shell/page-title.ts",
  "components/app-shell/use-page-title.ts",
  "components/evals/case-view.tsx",
  "components/evals/evals-view.tsx",
  "components/evals/run-label.tsx",
  "lib/eval/view.ts",
];

const SHELL_FOLDERS = [
  "components/app-shell/",
  "components/chat/",
  "components/evals/",
  "components/i18n/",
  "components/trace/",
  "lib/eval/",
  "lib/trace/",
];

/** The project's own files inside a shell folder (template spec §5.8). */
const PROJECT_FILES_IN_SHELL_FOLDERS = ["lib/eval/project.ts", "lib/eval/project.test.ts"];

export function isShellFile(file: string): boolean {
  return (
    (SHELL_FOLDERS.some((folder) => file.startsWith(folder)) &&
      !PROJECT_FILES_IN_SHELL_FOLDERS.includes(file)) ||
    I18N_SHELL_FILES.includes(file) ||
    CHAT_SHELL_FILES.includes(file) ||
    MOCK_SHELL_FILES.includes(file) ||
    TRACE_SHELL_FILES.includes(file) ||
    EVAL_SHELL_FILES.includes(file) ||
    APP_SHELL_FILES.includes(file)
  );
}

/**
 * The module specifiers a source imports: `import`, `export … from`, `import()` and `require()`.
 * TypeScript's own scanner reads them, so a comment or a string that mentions a path is not one.
 */
export function importSpecifiers(source: string): string[] {
  return ts.preProcessFile(source, true, true).importedFiles.map((reference) => reference.fileName);
}

/**
 * Whether an expression is the dictionary, as the shell names it (template spec §5.9): `t`, as
 * useLocale() and localized() give it, or `messages[locale]` and `messages.<locale>`. Any
 * identifier named `t` counts, so a shell file never names anything else `t`.
 */
function isDictionary(node: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(node)) return isDictionary(node.expression);
  if (ts.isIdentifier(node)) return node.text === "t";
  const onMessages = (target: ts.Expression) =>
    ts.isIdentifier(target) && target.text === "messages";
  if (ts.isPropertyAccessExpression(node)) {
    return onMessages(node.expression) && (LOCALES as readonly string[]).includes(node.name.text);
  }
  if (ts.isElementAccessExpression(node) && onMessages(node.expression)) {
    const index = node.argumentExpression;
    return (
      (ts.isIdentifier(index) && index.text === "locale") ||
      (ts.isStringLiteralLike(index) && (LOCALES as readonly string[]).includes(index.text))
    );
  }
  return false;
}

/**
 * The top-level keys a source reads from the dictionary, in order: `t.header`, `t["footer"]`,
 * `messages[locale].status`, `messages.en.chat` and `const { errors } = t`. TypeScript's parser
 * reads them, as TSX or TS by the file's name, so a comment or a string is not a read.
 */
export function dictionaryKeysRead(source: string, fileName = "source.tsx"): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const keys: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && isDictionary(node.expression)) {
      keys.push(node.name.text);
    } else if (
      ts.isElementAccessExpression(node) &&
      isDictionary(node.expression) &&
      ts.isStringLiteralLike(node.argumentExpression)
    ) {
      keys.push(node.argumentExpression.text);
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer !== undefined &&
      isDictionary(node.initializer)
    ) {
      for (const element of node.name.elements) {
        keys.push((element.propertyName ?? element.name).getText(file));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return keys;
}

const RESOLVED_ENDINGS = ["", ".ts", ".tsx", ".mts", ".js", ".mjs", "/index.ts", "/index.tsx"];

/**
 * The repo file an `@/…` or relative specifier points at, or null for a package. A path with no
 * file behind it is returned as written, so it is still checked by its folder.
 */
export function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = specifier.slice(2);
  else if (specifier.startsWith(".")) {
    base = path.posix.join(path.posix.dirname(fromFile), specifier);
  } else return null;
  for (const ending of RESOLVED_ENDINGS) {
    const candidate = path.join(ROOT, base + ending);
    if (existsSync(candidate) && statSync(candidate).isFile()) return base + ending;
  }
  return base;
}

/** The repo files a source file imports, packages left out. */
export function localImports(file: string): string[] {
  return importSpecifiers(readRepoFile(file))
    .map((specifier) => resolveImport(file, specifier))
    .filter((target): target is string => target !== null);
}

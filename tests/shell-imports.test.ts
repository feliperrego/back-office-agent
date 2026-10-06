import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { shellMessages } from "@/lib/i18n/shell-messages";
import {
  APP_SHELL_FILES,
  CHAT_SHELL_FILES,
  EVAL_SHELL_FILES,
  I18N_SHELL_FILES,
  MOCK_SHELL_FILES,
  ROOT,
  TRACE_SHELL_FILES,
  dictionaryKeysRead,
  importSpecifiers,
  isShellFile,
  localImports,
  readRepoFile,
  repoFiles,
  SOURCE_FILE,
} from "./helpers/repo-files";

// The shell's imports (X-01 design §4.1, §6). A project edits its own files freely and leaves
// the shell alone, so the shell may reach only the shell, the shadcn/ui primitives and lib/utils,
// and the project files whose names and exports every project keeps. This test travels with the
// shell: it holds in any project that has not edited the shell.

/**
 * The modules outside the shell that it may import, whose names and exports every project keeps
 * (X-01 design §6): the identity, the chat's limits, the dictionary, the mock's cues and answers
 * (MOCK_SCENARIOS, template spec §5.2) and the project's eval (EVAL_PROJECT, template spec §5.11);
 * and, for the eval's script and the header's values (lib/site-header.ts, template spec §5.12),
 * the model (template spec §5.1), and for the script the measurement paths (template spec §7.5).
 */
const PROJECT_MODULES_THE_SHELL_READS = [
  "lib/project.ts",
  "lib/chat/limits.ts",
  "lib/i18n/messages.ts",
  "lib/ai/mock-scenarios.ts",
  "lib/eval/project.ts",
  "lib/ai/model.ts",
  "lib/measure/record.ts",
];

/** Template files that are neither shell nor project: the shadcn/ui primitives and cn(). */
function isTemplateBase(file: string): boolean {
  return file.startsWith("components/ui/") || file === "lib/utils.ts";
}

const files = repoFiles();
const shellFiles = files.filter((file) => SOURCE_FILE.test(file) && isShellFile(file));

describe("import reading", () => {
  it("reads import statements, not text that looks like one", () => {
    const source = [
      '// Mirrors lib/chat/config.ts; import { X } from "@/lib/chat/config" would break §5.',
      'const note = "from @/lib/chat/limits";',
      'import type { A } from "./a";',
      'import "./side-effect";',
      'export { B } from "@/lib/b";',
      'const lazy = () => import("../c");',
    ].join("\n");
    expect(importSpecifiers(source)).toEqual(["./a", "./side-effect", "@/lib/b", "../c"]);
  });

  // Files that stay after the removal recipe, so this holds in every project.
  it("resolves the @/ alias and relative paths to repo files, and leaves packages out", () => {
    expect(localImports("lib/i18n/shell-messages.ts")).toEqual(["lib/i18n/locale.ts"]);
    expect(localImports("components/footer.tsx")).toEqual([
      "components/i18n/locale-provider.tsx",
      "lib/project.ts",
    ]);
  });
});

describe("shell imports", () => {
  it("the shell files are all present: i18n, the mock, the trace, the eval and the app shell always, the chat while it stays", () => {
    // The removal recipe of a non-chat project deletes components/chat/ with the rest of the chat
    // (X-01 design §5); the i18n part, the mock model, the trace, the eval, the app shell and the
    // Evals pages stay in every project.
    const keepsChat = existsSync(path.join(ROOT, "components/chat"));
    const expected = [
      ...I18N_SHELL_FILES,
      ...MOCK_SHELL_FILES,
      ...TRACE_SHELL_FILES,
      ...EVAL_SHELL_FILES,
      ...APP_SHELL_FILES,
      ...(keepsChat ? CHAT_SHELL_FILES : []),
    ];
    expect(expected.filter((file) => !files.includes(file))).toEqual([]);
    expect(shellFiles).toEqual(expect.arrayContaining(expected));
  });

  it("shell files import no project module but the ones every project keeps", () => {
    const outside = shellFiles.flatMap((file) =>
      localImports(file)
        .filter(
          (target) =>
            !isShellFile(target) &&
            !isTemplateBase(target) &&
            !PROJECT_MODULES_THE_SHELL_READS.includes(target),
        )
        .map((target) => `${file} imports ${target}`),
    );
    expect(outside).toEqual([]);
  });

  it("the eval core imports nothing of lib/chat/, so a project without a chat keeps it", () => {
    // A project's own runCase (lib/eval/project.ts) may run its chat's pipeline; the core never
    // does (template spec §5.11). The shell files of lib/chat/ pass the test above, so this one
    // names them; the RAG code would be a project module, which the test above already refuses.
    const core = files.filter((file) => EVAL_SHELL_FILES.includes(file) && SOURCE_FILE.test(file));
    expect(core).toContain("lib/eval/run.ts");
    const intoChat = core.flatMap((file) =>
      localImports(file)
        .filter((target) => target.startsWith("lib/chat/"))
        .map((target) => `${file} imports ${target}`),
    );
    expect(intoChat).toEqual([]);
  });

  it("nothing in lib/ai/ imports lib/chat/, so the mock model survives the removal recipe", () => {
    const aiFiles = files.filter((file) => file.startsWith("lib/ai/") && SOURCE_FILE.test(file));
    expect(aiFiles).toContain("lib/ai/mock.ts");
    const intoChat = aiFiles.flatMap((file) =>
      localImports(file)
        .filter((target) => target.startsWith("lib/chat/"))
        .map((target) => `${file} imports ${target}`),
    );
    expect(intoChat).toEqual([]);
  });
});

// The dictionary is one of the project modules the shell reads, and of it the shell reads only
// its own keys (template spec §5.9): a project's words reach a shell component through props, or
// through the project's toolLabel, so a project may rename or drop any key of its own.
describe("dictionary keys", () => {
  it("reads the top-level keys a source takes from the dictionary, not lookalikes", () => {
    const source = [
      "// t.inComment is a comment, not a read.",
      'const note = "t.inString";',
      "const { t } = useLocale();",
      "const a = t.header.newChat;",
      'const b = t["footer"].source;',
      "const c = messages[locale].status.complete;",
      'const d = messages["pt-BR"].list.label;',
      "const e = messages.en.chat.jump;",
      "const { errors, toolCall: chip } = t;",
      "const f = localized((t) => t.evals.title);",
      "const g = messages.length + messages[0].role.length;",
      "const h = tally.t + record.t;",
    ].join("\n");
    expect(dictionaryKeysRead(source)).toEqual([
      "header",
      "footer",
      "status",
      "list",
      "chat",
      "errors",
      "toolCall",
      "evals",
    ]);
  });

  it("shell files read only the shell's keys; a project's words come in through props", () => {
    const shellKeys = Object.keys(shellMessages.en);
    const footer = "components/footer.tsx";
    expect(dictionaryKeysRead(readRepoFile(footer), footer)).toEqual(["footer", "footer"]);
    const projectKeys = shellFiles.flatMap((file) =>
      dictionaryKeysRead(readRepoFile(file), file)
        .filter((key) => !shellKeys.includes(key))
        .map((key) => `${file} reads ${key}`),
    );
    expect(projectKeys).toEqual([]);
  });
});

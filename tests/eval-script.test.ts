import ts from "typescript";
import { describe, expect, it } from "vitest";
import { localImports, readRepoFile, resolveImport } from "./helpers/repo-files";

// `pnpm eval` loads .env.local before lib/ai/model.ts, which reads AI_MOCK and AI_MODEL when it
// loads (template spec §5.11), so a key or a token pulled into .env.local reaches a local real
// run. Its other rules are tested in lib/eval/command.test.ts.

const SCRIPT = "scripts/eval.ts";
const MODEL = "lib/ai/model.ts";
const source = readRepoFile(SCRIPT);

/** The repo files the script imports with a static, non-type import. */
function staticImports(): string[] {
  const file = ts.createSourceFile(SCRIPT, source, ts.ScriptTarget.Latest);
  return file.statements.flatMap((statement) =>
    ts.isImportDeclaration(statement) &&
    !statement.importClause?.isTypeOnly &&
    ts.isStringLiteral(statement.moduleSpecifier)
      ? [resolveImport(SCRIPT, statement.moduleSpecifier.text)].filter(
          (target): target is string => target !== null,
        )
      : [],
  );
}

/** Every repo file reachable from these files through any import. */
function reachable(files: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...files];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !/\.tsx?$/.test(file)) continue;
    seen.add(file);
    queue.push(...localImports(file));
  }
  return seen;
}

describe(SCRIPT, () => {
  it("reaches lib/ai/model.ts through no static import, which would load it before .env.local", () => {
    const reached = reachable(staticImports());
    expect(reached).toContain("lib/eval/command.ts");
    expect(reached.has(MODEL)).toBe(false);
  });

  it("loads .env.local before it imports the model and the project", () => {
    const loaded = source.indexOf("process.loadEnvFile(");
    expect(loaded).toBeGreaterThan(0);
    for (const specifier of ['import("@/lib/ai/model")', 'import("@/lib/eval/project")']) {
      expect(source.indexOf(specifier), specifier).toBeGreaterThan(loaded);
    }
  });
});

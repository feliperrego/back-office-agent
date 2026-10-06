import { builtinModules } from "node:module";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { readRepoFile, repoFiles, resolveImport, SOURCE_FILE } from "./helpers/repo-files";

// What a client component brings into the browser (template spec §5.12). A page reads the eval's
// run on the server with node:fs (lib/eval/runs.ts) and passes its client views the run as data;
// a client module may name the types of such a module, never import a value from it, directly or
// through another module, or the client bundle pulls in a module the browser does not have. This
// test travels with the shell, like tests/shell-imports.test.ts.

/** Modules that run on the server only, though they import no Node built-in. */
const SERVER_ONLY = [
  // It reads the server's environment when it loads, and throws in a browser (template spec §5.1).
  "lib/ai/model.ts",
];

function isNodeBuiltin(specifier: string): boolean {
  return specifier.startsWith("node:") || builtinModules.includes(specifier);
}

/** A string literal argument, as `import()` and `require()` take one. */
function literalArgument(node: ts.CallExpression): string | null {
  const [first] = node.arguments;
  return first !== undefined && ts.isStringLiteralLike(first) ? first.text : null;
}

/**
 * The modules a source imports for their values. `import type` and `export type` are left out,
 * since the compiler erases them; any other import is kept, `import { type A }` included, which
 * a bundler that keeps imports verbatim would load. So a node-only module is named with
 * `import type`, which says what it means.
 */
function valueImportSpecifiers(source: string): string[] {
  const file = ts.createSourceFile("source.tsx", source, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (!node.importClause?.isTypeOnly) found.push(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (!node.isTypeOnly) found.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)) {
      const isImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      const specifier = literalArgument(node);
      if ((isImport || isRequire) && specifier !== null) found.push(specifier);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** A module whose first statement is the "use client" directive. */
function isClientModule(source: string): boolean {
  const file = ts.createSourceFile("source.tsx", source, ts.ScriptTarget.Latest, true);
  const [first] = file.statements;
  return (
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use client"
  );
}

/**
 * What a client module reaches through value imports, one line each for a Node built-in or a
 * server-only module, with the chain of files that leads to it.
 */
function serverModulesReached(client: string): string[] {
  const findings: string[] = [];
  const seen = new Set<string>();
  const queue: string[][] = [[client]];
  while (queue.length > 0) {
    const chain = queue.shift()!;
    const file = chain.at(-1)!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (SERVER_ONLY.includes(file)) {
      findings.push(chain.join(" → "));
      continue;
    }
    if (!SOURCE_FILE.test(file)) continue;
    for (const specifier of valueImportSpecifiers(readRepoFile(file))) {
      if (isNodeBuiltin(specifier)) findings.push(`${chain.join(" → ")} → ${specifier}`);
      const target = resolveImport(file, specifier);
      if (target !== null && SOURCE_FILE.test(target)) queue.push([...chain, target]);
    }
  }
  return findings;
}

const sources = repoFiles().filter((file) => SOURCE_FILE.test(file) && !file.startsWith("docs/"));
const clientModules = sources.filter((file) => isClientModule(readRepoFile(file)));

describe("import reading", () => {
  it("keeps value imports and leaves out the ones the compiler erases", () => {
    const source = [
      '"use client";',
      '// import { readFileSync } from "node:fs" in a comment is no import',
      'import type { A } from "./types-only";',
      'import { type B } from "./inline-type";',
      'import { c } from "./value";',
      'import "./side-effect";',
      'export type { D } from "./re-exported-type";',
      'export { e } from "./re-exported-value";',
      'const lazy = () => import("./lazy");',
    ].join("\n");
    expect(valueImportSpecifiers(source)).toEqual([
      "./inline-type",
      "./value",
      "./side-effect",
      "./re-exported-value",
      "./lazy",
    ]);
    expect(isClientModule(source)).toBe(true);
    expect(isClientModule('import "./x";\n"use client";')).toBe(false);
  });
});

describe("client imports", () => {
  it("finds the client modules, the Evals views among them", () => {
    expect(clientModules).toEqual(
      expect.arrayContaining([
        "components/site-header.tsx",
        "components/evals/evals-view.tsx",
        "components/evals/case-view.tsx",
      ]),
    );
  });

  it("finds the server's own modules, so a client import of one would fail below", () => {
    expect(serverModulesReached("lib/eval/runs.ts")).toEqual(
      expect.arrayContaining(["lib/eval/runs.ts → node:fs"]),
    );
    expect(serverModulesReached("lib/site-header.ts")).toEqual([
      "lib/site-header.ts → lib/ai/model.ts",
    ]);
  });

  it("no client module reaches a Node built-in or a server-only module through a value import", () => {
    expect(clientModules.flatMap(serverModulesReached)).toEqual([]);
  });
});

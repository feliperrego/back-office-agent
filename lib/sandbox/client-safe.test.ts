import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// lib/sandbox is pure and client-safe (spec §4.2, P2-22): the route, the eval and the browser's
// approval card all run it. So it imports only its own files, the store's pure modules and its
// data, zod, and the AI SDK's types, which the compiler erases; never a Node built-in, the model
// or the network. tests/client-imports.test.ts checks the browser's side once a client component
// imports it.

const DIR = "lib/sandbox";
const ALLOWED = [
  /^\.\/[a-z-]+$/,
  /^@\/lib\/store\/(customers|dates|business-days)$/,
  /^@\/data\/[a-z]+\.json$/,
  /^zod$/,
];

/** Every module specifier a source imports, with whether the import is type-only. */
function imports(source: string): { specifier: string; typeOnly: boolean }[] {
  const file = ts.createSourceFile("source.ts", source, ts.ScriptTarget.Latest, true);
  const found: { specifier: string; typeOnly: boolean }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push({
        specifier: node.moduleSpecifier.text,
        typeOnly: node.importClause?.isTypeOnly ?? false,
      });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      found.push({ specifier: "dynamic import()", typeOnly: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

const modules = readdirSync(DIR).filter(
  (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
);

describe("lib/sandbox", () => {
  it("has its modules", () => {
    expect(modules.sort()).toEqual([
      "calls.ts",
      "card.ts",
      "dates.ts",
      "fold.ts",
      "requests.ts",
      "sandbox.ts",
    ]);
  });

  it("imports only pure modules for their values, and the AI SDK for its types only", () => {
    for (const file of modules) {
      for (const { specifier, typeOnly } of imports(readFileSync(path.join(DIR, file), "utf8"))) {
        if (specifier === "ai" && typeOnly) continue;
        expect(
          ALLOWED.some((pattern) => pattern.test(specifier)),
          `${file} imports ${specifier}`,
        ).toBe(true);
      }
    }
  });

  it("finds a forbidden import", () => {
    expect(imports('import { streamText } from "ai";')).toEqual([
      { specifier: "ai", typeOnly: false },
    ]);
    expect(imports('import type { UIMessage } from "ai";')).toEqual([
      { specifier: "ai", typeOnly: true },
    ]);
    expect(ALLOWED.some((pattern) => pattern.test("node:fs"))).toBe(false);
    expect(ALLOWED.some((pattern) => pattern.test("@/lib/ai/model"))).toBe(false);
  });
});

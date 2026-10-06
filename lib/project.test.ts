import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME, PROJECT_SLUG, REPO_URL } from "./project";

// The identity a project edits when it is created (X-01 design §4.1, §6): these checks catch
// a project that renames itself in one place and not in the others.
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { name: string };

describe("project identity", () => {
  it("uses the package.json name as its slug", () => {
    expect(PROJECT_SLUG).toBe(packageJson.name);
  });

  it("points the repo URL at the repo named by the slug", () => {
    expect(REPO_URL.endsWith(`/${PROJECT_SLUG}`)).toBe(true);
    expect(REPO_URL).toMatch(/^https:\/\//);
  });

  it("names and describes the product", () => {
    expect(PRODUCT_NAME.trim()).not.toBe("");
    expect(PRODUCT_DESCRIPTION.trim()).not.toBe("");
  });
});

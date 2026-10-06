import { describe, expect, it } from "vitest";
import { parseArticle } from "./articles";

describe("parseArticle", () => {
  it("takes the id from the file name and the title and category from the frontmatter", () => {
    const content = '---\ntitle: "Returns"\ncategory: Returns and refunds\n---\n\n## Window\n';
    expect(parseArticle("returns.md", content)).toEqual({
      id: "returns",
      file: "returns.md",
      title: "Returns",
      category: "Returns and refunds",
      content,
    });
  });

  it("rejects a file without frontmatter, title or category", () => {
    expect(() => parseArticle("a.md", "## Window\n")).toThrow("a.md has no frontmatter");
    expect(() => parseArticle("b.md", "---\ncategory: X\n---\n")).toThrow("no frontmatter title");
    expect(() => parseArticle("c.md", "---\ntitle: X\n---\n")).toThrow("no frontmatter category");
  });
});

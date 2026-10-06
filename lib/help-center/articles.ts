import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * The nine help-center articles spec §3 names, copied verbatim from P1 (support-assistant
 * content/help-center at f56063b, P2-25), whose texts Felipe approved for P1 on 2026-10-02. The
 * agent's instructions give them to the model verbatim (spec §3, P2-16). Relative to the repo
 * root. Copied from P1's reader. Server-only: it reads the files from disk.
 */
export const HELP_CENTER_DIR = "content/help-center";

const ARTICLE_EXTENSION = ".md";

/** One article. Its id is the file name without ".md". */
export type Article = {
  id: string;
  /** The file name inside HELP_CENTER_DIR, such as "returns.md". */
  file: string;
  title: string;
  /** The article's group in P1's Help Center. */
  category: string;
  /** The whole file, frontmatter included. */
  content: string;
};

/** The frontmatter's `key: value` lines; a value may sit in matching quotes. */
function readFrontmatter(file: string, content: string): Record<string, string> {
  const lines = content.split("\n");
  const close = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  if (close === -1) throw new Error(`${file} has no frontmatter`);
  const fields: Record<string, string> = {};
  for (const line of lines.slice(1, close)) {
    const match = /^([a-z]+):\s*(.*)$/.exec(line);
    if (match) fields[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return fields;
}

/** Parses one article file; throws when its title or category is missing. */
export function parseArticle(file: string, content: string): Article {
  const { title, category } = readFrontmatter(file, content);
  if (!title) throw new Error(`${file} has no frontmatter title`);
  if (!category) throw new Error(`${file} has no frontmatter category`);
  return { id: path.basename(file, ARTICLE_EXTENSION), file, title, category, content };
}

/** Reads the .md files directly inside `dir`, sorted by file name in code-unit order. */
export function readHelpCenter(dir: string = HELP_CENTER_DIR): Article[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(ARTICLE_EXTENSION))
    .map((entry) => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((file) => parseArticle(file, readFileSync(path.join(dir, file), "utf8")));
}

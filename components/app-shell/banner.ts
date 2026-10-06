/**
 * Where the app shell's banner puts its one link (P2's spec §1; for X-03): the project's sentence
 * marks the place with {link}, so each language places it where its grammar wants it. Null for a
 * sentence with no {link}, which the banner shows as it is. Pure.
 */
export function bannerParts(text: string): { before: string; after: string } | null {
  const at = text.indexOf("{link}");
  if (at === -1) return null;
  return { before: text.slice(0, at), after: text.slice(at + "{link}".length) };
}

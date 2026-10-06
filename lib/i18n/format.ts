/**
 * Fills `{name}` placeholders from `values`, in one pass; values go in verbatim.
 * Other text, including a placeholder with no value, is left as it is.
 */
export function format(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}

export const MAX_SELECTION_LENGTH = 2000;

/** Formats highlighted page text as a Markdown blockquote for the notes field. */
export function selectionQuote(text: string, max = MAX_SELECTION_LENGTH): string {
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return '';
  const clipped = normalized.slice(0, max);
  return clipped
    .split('\n')
    .map((line) => {
      const clean = line.replace(/[ \t]+$/, '');
      return clean ? `> ${clean}` : '>';
    })
    .join('\n');
}

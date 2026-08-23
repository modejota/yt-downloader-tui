/**
 * Hard-truncate text to `maxWidth` cells with an ellipsis, for one-line rows
 * whose content would otherwise wrap (or push right-aligned siblings away).
 */
export function truncateText(text: string, maxWidth: number): string {
  if (maxWidth < 1) return "";
  if (text.length <= maxWidth) return text;
  return `${text.slice(0, Math.max(0, maxWidth - 1))}…`;
}

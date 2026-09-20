/** Renders text with match ranges (UTF-16 offsets into the original string). */
export function HighlightedText({
  text,
  ranges,
}: {
  text: string;
  ranges: Array<{ start: number; end: number }>;
}) {
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  for (const [i, r] of sorted.entries()) {
    if (r.end <= cursor) continue; // defensive: skip overlaps
    if (r.start > cursor) parts.push(text.slice(cursor, r.start));
    parts.push(<mark key={i}>{text.slice(Math.max(r.start, cursor), r.end)}</mark>);
    cursor = r.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

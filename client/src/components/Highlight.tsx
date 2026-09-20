import type { Range } from '../../../shared/types';

/**
 * 按范围渲染高亮。范围是服务端返回的「原始字符串」code unit 区间，
 * 直接 slice，不做任何再变换，保证高亮不漂移。
 */
export function Highlight({ text, ranges }: { text: string; ranges: Range[] }) {
  const parts: React.ReactNode[] = [];
  let pos = 0;
  ranges.forEach(([s, e], i) => {
    if (s > pos) parts.push(<span key={`t${i}`}>{text.slice(pos, s)}</span>);
    parts.push(<mark key={`m${i}`}>{text.slice(s, e)}</mark>);
    pos = e;
  });
  if (pos < text.length) parts.push(<span key="tail">{text.slice(pos)}</span>);
  return <span className="highlight">{parts}</span>;
}

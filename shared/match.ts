import type { Range, SearchConfig } from './types';

export interface TransformedText {
  /** 变换后的文本，匹配在它上面进行 */
  text: string;
  /**
   * map[i] 是变换后第 i 个 code unit 在「原始字符串」中对应的
   * code unit 区间（按字素簇对齐）。高亮范围通过它映射回原串，
   * 因此规范化/大小写折叠/变音符剥离不会让范围漂移到错误字符。
   */
  map: { start: number; end: number }[];
}

/**
 * 按字素簇（grapheme cluster）切分后逐簇变换，并为每个输出 code unit
 * 记录其来源簇在原串中的区间。簇内可能发生重排（NFD）、扩展（İ→i+◌̇）
 * 或收缩（剥离变音符），但都不会跨簇边界，因此簇级映射足以保证
 * 高亮始终覆盖完整的原始字素（包括代理对与组合序列）。
 */
export function transformWithMap(
  input: string,
  cfg: SearchConfig,
  locale: string,
): TransformedText {
  const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
  let text = '';
  const map: { start: number; end: number }[] = [];

  for (const seg of segmenter.segment(input)) {
    const start = seg.index;
    const end = start + seg.segment.length;
    let t = seg.segment;
    if (cfg.normalization !== 'none') t = t.normalize(cfg.normalization);
    if (cfg.caseFold === 'locale') t = t.toLocaleLowerCase(locale || undefined);
    else if (cfg.caseFold === 'default') t = t.toLowerCase();
    // 折叠后再剥离：土耳其语 İ 先折成 i+◌̇，再剥成 i
    if (cfg.stripDiacritics) t = t.normalize('NFD').replace(/\p{M}/gu, '');

    for (let i = 0; i < t.length; i++) map.push({ start, end });
    text += t;
  }
  return { text, map };
}

/**
 * 在 original 中查找 query，返回映射到「原始字符串」的高亮范围。
 * 范围按出现顺序排列，相邻/重叠的命中已合并。
 */
export function findRanges(
  original: string,
  query: string,
  cfg: SearchConfig,
  locale: string,
): Range[] {
  if (!query) return [];
  const hay = transformWithMap(original, cfg, locale);
  const needle = transformWithMap(query, cfg, locale).text;
  if (!needle || needle.length > hay.text.length) return [];

  const ranges: Range[] = [];
  let from = 0;
  while (from <= hay.text.length - needle.length) {
    const idx = hay.text.indexOf(needle, from);
    if (idx === -1) break;
    const first = hay.map[idx];
    const last = hay.map[idx + needle.length - 1];
    if (!first || !last) break;
    const start = first.start;
    const end = last.end;
    const prev = ranges[ranges.length - 1];
    // 仅合并真正重叠的命中；相邻命中保持独立，逐条对应一次匹配
    if (prev && start < prev[1]) {
      prev[1] = Math.max(prev[1], end);
    } else {
      ranges.push([start, end]);
    }
    from = idx + needle.length;
  }
  return ranges;
}

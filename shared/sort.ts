import type { CollationConfig, Sample } from './types';

export function makeCollator(cfg: CollationConfig): Intl.Collator {
  return new Intl.Collator(cfg.locale || undefined, {
    sensitivity: cfg.sensitivity,
    numeric: cfg.numeric,
    caseFirst: cfg.caseFirst === 'false' ? undefined : cfg.caseFirst,
    ignorePunctuation: cfg.ignorePunctuation,
  });
}

/**
 * 用 Intl.Collator 排序；比较相等时按样本 id 升序决胜，
 * 结果与输入顺序无关（稳定且确定）。
 */
export function sortSamples(samples: Sample[], cfg: CollationConfig): number[] {
  const collator = makeCollator(cfg);
  return samples
    .slice()
    .sort((a, b) => collator.compare(a.text, b.text) || a.id - b.id)
    .map((s) => s.id);
}

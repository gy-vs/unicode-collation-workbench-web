import { describe, expect, it } from 'vitest';
import { sortSamples } from '../shared/sort';
import type { CollationConfig, Sample } from '../shared/types';

const col = (over: Partial<CollationConfig> = {}): CollationConfig => ({
  locale: 'en',
  sensitivity: 'variant',
  numeric: false,
  caseFirst: 'false',
  ignorePunctuation: false,
  ...over,
});

const samples = (texts: [number, string][]): Sample[] =>
  texts.map(([id, text]) => ({ id, text }));

describe('数字片段', () => {
  const files = samples([
    [1, 'file10'],
    [2, 'file2'],
    [3, 'file1'],
  ]);

  it('numeric=true 按数值排序', () => {
    expect(sortSamples(files, col({ numeric: true }))).toEqual([3, 2, 1]);
  });

  it('numeric=false 按字典序排序', () => {
    expect(sortSamples(files, col({ numeric: false }))).toEqual([3, 1, 2]);
  });
});

describe('排序并列的稳定决胜', () => {
  it('比较相等时按样本 id 升序', () => {
    const s = samples([
      [7, 'A'],
      [3, 'a'],
      [5, 'A'],
    ]);
    expect(sortSamples(s, col({ sensitivity: 'base' }))).toEqual([3, 5, 7]);
  });

  it('结果与输入顺序无关', () => {
    const a = samples([
      [1, 'b'],
      [2, 'a'],
      [3, 'a'],
      [4, 'c'],
    ]);
    const b = samples([
      [4, 'c'],
      [3, 'a'],
      [2, 'a'],
      [1, 'b'],
    ]);
    expect(sortSamples(a, col())).toEqual(sortSamples(b, col()));
    expect(sortSamples(b, col())).toEqual([2, 3, 1, 4]);
  });

  it('规范化等价但码位不同的字符串在 variant 下稳定决胜', () => {
    const s = samples([
      [9, 'caf\u00E9'], // 预组合
      [4, 'cafe\u0301'], // 分解
    ]);
    // ICU 默认二者相等 → 按 id 决胜；即使某平台区分，结果也必须确定
    const r1 = sortSamples(s, col());
    const r2 = sortSamples([...s].reverse(), col());
    expect(r1).toEqual(r2);
  });
});

describe('locale 相关排序', () => {
  it('sv 与 de 对 ä 的处理不同', () => {
    const s = samples([
      [1, 'z'],
      [2, '\u00E4'],
      [3, 'a'],
    ]);
    const de = sortSamples(s, col({ locale: 'de' }));
    const sv = sortSamples(s, col({ locale: 'sv' }));
    expect(de).toEqual([3, 2, 1]); // 德语 ä 跟在 a 后
    expect(sv).toEqual([3, 1, 2]); // 瑞典语 ä 排在 z 后
  });
});

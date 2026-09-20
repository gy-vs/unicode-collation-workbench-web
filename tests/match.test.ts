import { describe, expect, it } from 'vitest';
import { findRanges, transformWithMap } from '../shared/match';
import type { SearchConfig } from '../shared/types';

const cfg = (over: Partial<SearchConfig> = {}): SearchConfig => ({
  normalization: 'NFD',
  stripDiacritics: true,
  caseFold: 'default',
  ...over,
});

// 关键码位（全部用转义书写，避免源码文件被规范化）：
//   é = é（预组合） / e + ́（e + 组合尖音符）
//   İ = İ（土耳其大写 I，tr 折叠为 i + ̇）
const PRE_E = 'caf\u00E9'; // 预组合 café
const DE_E = 'cafe\u0301'; // 分解 café

describe('组合字符', () => {
  it('预组合查询命中分解样本，范围映射回原串', () => {
    const sample = `${DE_E} x`;
    const ranges = findRanges(sample, PRE_E, cfg(), 'en');
    expect(ranges).toEqual([[0, 5]]);
    expect(sample.slice(0, 5)).toBe(DE_E);
  });

  it('分解查询命中预组合样本', () => {
    const ranges = findRanges(PRE_E, DE_E, cfg(), 'en');
    expect(ranges).toEqual([[0, 4]]);
  });

  it('规范化膨胀后范围不漂移', () => {
    // 预组合 é 占 1 个 code unit，'lan' 从 1 开始
    expect(findRanges('\u00E9lan', 'lan', cfg(), 'en')).toEqual([[1, 4]]);
    // 分解形式 e+◌́ 占 2 个 code unit，'lan' 从 2 开始
    expect(findRanges('e\u0301lan', 'lan', cfg(), 'en')).toEqual([[2, 5]]);
  });

  it('不规范化且不剥离变音符时 cafe 不命中 café', () => {
    const strict = cfg({ normalization: 'none', stripDiacritics: false });
    expect(findRanges(PRE_E, 'cafe', strict, 'en')).toEqual([]);
  });
});

describe('代理对与字素簇', () => {
  it('带肤色修饰符的 emoji 整体命中，范围为 code unit 区间', () => {
    const s = 'a👍🏽b';
    const ranges = findRanges(s, '👍🏽', cfg(), 'en');
    expect(ranges).toEqual([[1, 5]]);
    expect(s.slice(1, 5)).toBe('👍🏽');
  });

  it('辅助平面字符（𝄞）前的偏移按 code unit 计算', () => {
    const s = '𝄞xy';
    expect(findRanges(s, 'xy', cfg(), 'en')).toEqual([[2, 4]]);
  });

  it('emoji 之后的命中范围不错位', () => {
    const s = `👍🏽 ${DE_E}!`;
    expect(findRanges(s, PRE_E, cfg(), 'en')).toEqual([[5, 10]]);
  });
});

describe('土耳其大小写', () => {
  it('tr locale 下 I 折叠为 ı，İ 折叠为 i+◌̇', () => {
    expect('I'.toLocaleLowerCase('tr')).toBe('ı');
    // ICU 版本差异：\u0130 可能折为 'i' 或 'i' + \u0307，两者剥音符后都是 i
    const folded = '\u0130'.toLocaleLowerCase('tr');
    expect(['i', 'i\u0307']).toContain(folded);
  });

  it('按 locale 折叠：查询 ı 命中 Istanbul 首字母，查询 i 不命中 I', () => {
    expect(findRanges('Istanbul', 'ı', cfg({ caseFold: 'locale' }), 'tr')).toEqual([[0, 1]]);
    expect(findRanges('I', 'i', cfg({ caseFold: 'locale' }), 'tr')).toEqual([]);
  });

  it('默认折叠：查询 i 命中 I', () => {
    expect(findRanges('I', 'i', cfg(), 'en')).toEqual([[0, 1]]);
  });

  it('İ 折叠+剥音符后可用 i 命中，范围仍指向原字符', () => {
    // \u0130zmir 折叠后含两个 i（首字母与 zmir 中的 i），均映射回原串
    const ranges = findRanges('\u0130zmir', 'i', cfg({ caseFold: 'locale' }), 'tr');
    expect(ranges).toEqual([
      [0, 1],
      [3, 4],
    ]);
    expect('\u0130zmir'.slice(0, 1)).toBe('\u0130');
  });
});

describe('边界与合并', () => {
  it('空查询或变换后为空的查询不命中', () => {
    expect(findRanges('abc', '', cfg(), 'en')).toEqual([]);
    expect(findRanges('abc', '\u0301', cfg(), 'en')).toEqual([]); // 纯组合符被剥离
  });

  it('多次命中按序返回，相邻命中保持独立', () => {
    expect(findRanges('abab', 'ab', cfg(), 'en')).toEqual([
      [0, 2],
      [2, 4],
    ]);
    expect(findRanges('aaa', 'aa', cfg(), 'en')).toEqual([[0, 2]]);
  });

  it('不折叠大小写时区分大小写', () => {
    expect(findRanges('CAFE cafe', 'cafe', cfg({ caseFold: 'none' }), 'en')).toEqual([[5, 9]]);
  });

  it('transformWithMap 的 map 覆盖每个输出 code unit', () => {
    const { text, map } = transformWithMap('a\u00E9\u{1F44D}', cfg(), 'en');
    expect(text).toBe('ae\u{1F44D}');
    expect(map).toHaveLength(text.length);
    // é 被分解+剥离后，输出的 e 仍映射回原串 [1,2)
    expect(map[1]).toEqual({ start: 1, end: 2 });
  });
});

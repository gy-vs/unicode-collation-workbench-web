import type { ExperimentConfig, ExperimentPayload } from './types';

export const DEFAULT_CONFIG: ExperimentConfig = {
  collation: {
    locale: 'en',
    sensitivity: 'variant',
    numeric: true,
    caseFirst: 'false',
    ignorePunctuation: false,
  },
  search: {
    normalization: 'NFD',
    stripDiacritics: true,
    caseFold: 'locale',
  },
};

/** 覆盖组合字符、代理对、土耳其大小写、数字片段与排序并列的种子样本 */
export function seedPayload(): ExperimentPayload {
  return {
    name: '未命名实验',
    config: DEFAULT_CONFIG,
    samples: [
      { id: 1, text: 'caf\u00E9' }, // 预组合 é (U+00E9)
      { id: 2, text: 'cafe\u0301' }, // e + 组合尖音符 (U+0301)
      { id: 3, text: 'CAFE' },
      { id: 4, text: 'resume' },
      { id: 5, text: 'résumé' },
      { id: 6, text: 'Istanbul' },
      { id: 7, text: 'İzmir' }, // 土耳其大写 İ
      { id: 8, text: 'ıspanak' }, // 土耳其无点 ı
      { id: 9, text: 'file1' },
      { id: 10, text: 'file2' },
      { id: 11, text: 'file10' },
      { id: 12, text: '👍🏽 表情' }, // 代理对 + 肤色修饰符
      { id: 13, text: '𝄞 乐章' }, // 辅助平面字符
      { id: 14, text: 'Straße' },
      { id: 15, text: 'strasse' },
    ],
    queries: [
      { id: 1, text: 'cafe' },
      { id: 2, text: 'i' },
      { id: 3, text: 'file1' },
      { id: 4, text: '👍' },
    ],
  };
}

export type Sensitivity = 'base' | 'accent' | 'case' | 'variant';
export type NormalizationForm = 'none' | 'NFC' | 'NFD' | 'NFKC' | 'NFKD';
export type CaseFirst = 'false' | 'lower' | 'upper';
export type CaseFold = 'none' | 'default' | 'locale';

export interface CollationConfig {
  /** BCP-47 locale；空字符串表示使用运行时默认 locale */
  locale: string;
  sensitivity: Sensitivity;
  numeric: boolean;
  caseFirst: CaseFirst;
  ignorePunctuation: boolean;
}

export interface SearchConfig {
  /** 匹配前对样本与查询应用的 Unicode 规范化形式 */
  normalization: NormalizationForm;
  /** 规范化后剥离组合变音符（\p{M}） */
  stripDiacritics: boolean;
  /** none: 不折叠；default: toLowerCase；locale: 按排序 locale 折叠（如土耳其语 I→ı） */
  caseFold: CaseFold;
}

export interface ExperimentConfig {
  collation: CollationConfig;
  search: SearchConfig;
}

export interface Sample {
  id: number;
  text: string;
}

export interface Query {
  id: number;
  text: string;
}

/** 可保存/可预览的实验内容（不含服务端管理的字段） */
export interface ExperimentPayload {
  name: string;
  config: ExperimentConfig;
  samples: Sample[];
  queries: Query[];
}

export interface Experiment extends ExperimentPayload {
  id: string;
  revision: number;
  updatedAt: string;
}

export interface ExperimentSummary {
  id: string;
  name: string;
  revision: number;
  updatedAt: string;
}

/**
 * 半开区间 [start, end)，单位为 UTF-16 code unit，
 * 始终指向「原始」样本字符串，可直接用于 String.prototype.slice。
 */
export type Range = [number, number];

export interface SearchHit {
  sampleId: number;
  ranges: Range[];
}

export interface QueryResult {
  queryId: number;
  hits: SearchHit[];
}

export interface ExperimentResults {
  /** 排序后的样本 id 序列（服务端生成，稳定） */
  sorted: number[];
  searches: QueryResult[];
  /** 排序器实际生效的参数，便于核对平台 ICU 行为 */
  collator: Intl.CollatorOptions & { locale: string };
}

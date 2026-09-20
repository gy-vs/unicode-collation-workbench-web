import type {
  CaseFirst,
  CaseFold,
  ExperimentPayload,
  NormalizationForm,
  Query,
  Sample,
  Sensitivity,
} from './types';
import { DEFAULT_CONFIG } from './defaults';

const SENSITIVITIES: Sensitivity[] = ['base', 'accent', 'case', 'variant'];
const FORMS: NormalizationForm[] = ['none', 'NFC', 'NFD', 'NFKC', 'NFKD'];
const CASE_FIRST: CaseFirst[] = ['false', 'lower', 'upper'];
const CASE_FOLD: CaseFold[] = ['none', 'default', 'locale'];

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function locale(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '';
  try {
    // 非法 locale 直接回退为运行时默认，而不是让请求失败
    new Intl.Collator(value);
    return value;
  } catch {
    return '';
  }
}

function rows<T extends Sample | Query>(value: unknown, max: number): T[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const out: T[] = [];
  for (const raw of value.slice(0, max)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === 'number' && Number.isInteger(r.id) ? r.id : NaN;
    if (!Number.isInteger(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, text: text(r.text, '') } as T);
  }
  return out;
}

/** 把不可信输入清洗成合法的实验载荷；缺省字段回退到默认配置。 */
export function sanitizePayload(input: unknown): ExperimentPayload {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const cfg = (typeof raw.config === 'object' && raw.config !== null ? raw.config : {}) as Record<
    string,
    unknown
  >;
  const col = (typeof cfg.collation === 'object' && cfg.collation !== null
    ? cfg.collation
    : {}) as Record<string, unknown>;
  const sea = (typeof cfg.search === 'object' && cfg.search !== null ? cfg.search : {}) as Record<
    string,
    unknown
  >;

  return {
    name: text(raw.name, '未命名实验').slice(0, 200) || '未命名实验',
    config: {
      collation: {
        locale: locale(col.locale ?? DEFAULT_CONFIG.collation.locale),
        sensitivity: pick(col.sensitivity, SENSITIVITIES, DEFAULT_CONFIG.collation.sensitivity),
        numeric: bool(col.numeric, DEFAULT_CONFIG.collation.numeric),
        caseFirst: pick(col.caseFirst, CASE_FIRST, DEFAULT_CONFIG.collation.caseFirst),
        ignorePunctuation: bool(
          col.ignorePunctuation,
          DEFAULT_CONFIG.collation.ignorePunctuation,
        ),
      },
      search: {
        normalization: pick(sea.normalization, FORMS, DEFAULT_CONFIG.search.normalization),
        stripDiacritics: bool(sea.stripDiacritics, DEFAULT_CONFIG.search.stripDiacritics),
        caseFold: pick(sea.caseFold, CASE_FOLD, DEFAULT_CONFIG.search.caseFold),
      },
    },
    samples: rows<Sample>(raw.samples, 2000),
    queries: rows<Query>(raw.queries, 500),
  };
}

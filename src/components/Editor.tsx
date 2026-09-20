import type { ExperimentContent, Sensitivity } from '../types';

export interface EditorProps {
  draft: ExperimentContent & { id: string };
  onChange: (patch: Partial<ExperimentContent>) => void;
  onSampleText: (id: number, text: string) => void;
  onAddSample: () => void;
  onRemoveSample: (id: number) => void;
  localeError: string | null;
  hiddenNarrow: boolean;
}

const SENSITIVITIES: Array<{ value: Sensitivity; label: string }> = [
  { value: 'variant', label: 'variant · 区分大小写与变音符' },
  { value: 'case', label: 'case · 区分大小写，忽略变音符' },
  { value: 'accent', label: 'accent · 忽略大小写，区分变音符' },
  { value: 'base', label: 'base · 忽略大小写与变音符' },
];

// Common BCP-47 tags; the field is free text (with a datalist) so extension
// subtags like de-DE-u-co-phonebk can be typed as well.
const LOCALE_SUGGESTIONS = [
  'en',
  'tr',
  'de',
  'de-DE-u-co-phonebk',
  'fr',
  'es',
  'sv',
  'zh',
  'ja',
  'cs',
  'pl',
];

export function Editor({
  draft,
  onChange,
  onSampleText,
  onAddSample,
  onRemoveSample,
  localeError,
  hiddenNarrow,
}: EditorProps) {
  return (
    <section className={`pane editor ${hiddenNarrow ? 'hidden-narrow' : ''}`} aria-label="编辑区">
      <h2>排序与检索配置</h2>
      <div className="config-grid">
        <label>
          Locale（BCP-47）
          <input
            list="locale-list"
            value={draft.locale}
            onChange={(e) => onChange({ locale: e.target.value })}
            spellCheck={false}
            aria-label="locale"
          />
          <datalist id="locale-list">
            {LOCALE_SUGGESTIONS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>
        <label>
          灵敏度
          <select
            value={draft.sensitivity}
            onChange={(e) => onChange({ sensitivity: e.target.value as Sensitivity })}
            aria-label="sensitivity"
          >
            {SENSITIVITIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="wide">
          <span className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.numeric}
              onChange={(e) => onChange({ numeric: e.target.checked })}
              aria-label="numeric"
            />
            数字片段按数值排序（numeric / co=kn：File 2 &lt; File 10）
          </span>
        </label>
      </div>
      {localeError && <div className="locale-error" role="alert">{localeError}</div>}

      <h2>查询</h2>
      <input
        className="query-input"
        value={draft.query}
        onChange={(e) => onChange({ query: e.target.value })}
        placeholder="输入子串，结果区按原字符串范围高亮…"
        aria-label="query"
        spellCheck={false}
      />

      <h2>样本（{draft.samples.length}）</h2>
      <div className="samples-editor">
        {draft.samples.map((s) => (
          <div className="sample-row" key={s.id}>
            <span className="sample-id" title="稳定样本 id">#{s.id}</span>
            <input
              value={s.text}
              onChange={(e) => onSampleText(s.id, e.target.value)}
              aria-label={`sample-${s.id}`}
              spellCheck={false}
            />
            <button
              className="icon-btn"
              onClick={() => onRemoveSample(s.id)}
              aria-label={`remove-${s.id}`}
              title="删除样本"
            >
              ✕
            </button>
          </div>
        ))}
        <button className="btn" onClick={onAddSample}>
          ＋ 添加样本
        </button>
      </div>
    </section>
  );
}

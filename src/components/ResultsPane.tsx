import { useMemo, useState } from 'react';
import type { EvaluationResult } from '../types';
import { HighlightedText } from './HighlightedText';

export interface ResultsPaneProps {
  results: EvaluationResult | null;
  selected: ReadonlySet<number>;
  onToggle: (id: number) => void;
  hiddenNarrow: boolean;
}

export function ResultsPane({ results, selected, onToggle, hiddenNarrow }: ResultsPaneProps) {
  const [onlySelected, setOnlySelected] = useState(false);

  const tieCount = useMemo(() => {
    if (!results) return 0;
    const groups = new Set<number>();
    for (const r of results.ranked) if (r.tieGroup >= 0) groups.add(r.tieGroup);
    return groups.size;
  }, [results]);

  return (
    <section className={`pane results ${hiddenNarrow ? 'hidden-narrow' : ''}`} aria-label="结果区">
      <div className="result-toolbar">
        <strong>排序结果</strong>
        <span className="muted">
          {results ? results.ranked.length : 0} 行
          {tieCount > 0 ? ` · ${tieCount} 个并列组` : ''} · 已选 {selected.size}
        </span>
        <span className="spacer" />
        <label className="checkbox-row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={onlySelected}
            onChange={(e) => setOnlySelected(e.target.checked)}
            aria-label="only-selected"
          />
          只看选中
        </label>
      </div>

      {!results ? (
        <div className="no-hits">等待配置…</div>
      ) : results.ranked.length === 0 ? (
        <div className="no-hits">还没有样本，先在编辑区添加。</div>
      ) : (
        <div className="result-list">
          {results.ranked.map((row) => {
            const isSelected = selected.has(row.sampleId);
            if (onlySelected && !isSelected) return null;
            return (
              <div
                key={row.sampleId}
                className={[
                  'result-row',
                  row.tieGroup >= 0 ? 'tied' : '',
                  isSelected ? 'selected' : '',
                  onlySelected && !isSelected ? 'dimmed' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="rank" title="排序名次">
                  {row.rank + 1}
                </span>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(row.sampleId)}
                  aria-label={`select-${row.sampleId}`}
                />
                {row.tieGroup >= 0 && (
                  <span className="tie-tag" title="排序键相等，已按样本 id 决胜">
                    并列 #{row.tieGroup + 1}
                  </span>
                )}
                <span className="result-text">
                  <HighlightedText text={row.text} ranges={row.ranges} />
                </span>
                <span className="sample-id">#{row.sampleId}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

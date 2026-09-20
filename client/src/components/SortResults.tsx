import type { ExperimentResults, Sample } from '../../../shared/types';

interface Props {
  results: ExperimentResults | null;
  samples: Sample[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
}

export function SortResults({ results, samples, selected, onToggle, onSelectAll, onClear }: Props) {
  const byId = new Map(samples.map((s) => [s.id, s]));
  const c = results?.collator;
  return (
    <section className="card">
      <h3>
        排序结果{' '}
        {c && (
          <small>
            locale={c.locale} · sensitivity={String(c.sensitivity)} · numeric=
            {String(c.numeric)} · caseFirst={String(c.caseFirst)}
          </small>
        )}
      </h3>
      <div className="toolbar">
        <button onClick={onSelectAll}>全选</button>
        <button onClick={onClear}>清空选择</button>
        <span className="muted">已选 {selected.size} 项（重排不丢失）</span>
      </div>
      <ol className="sort-list">
        {(results?.sorted ?? []).map((id, i) => {
          const s = byId.get(id);
          if (!s) return null;
          const sel = selected.has(id);
          return (
            <li key={id} className={sel ? 'selected' : ''}>
              <label>
                <input type="checkbox" checked={sel} onChange={() => onToggle(id)} />
                <span className="ord">{i + 1}</span>
                <span className="badge">#{id}</span>
                <span className="text">{s.text}</span>
              </label>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

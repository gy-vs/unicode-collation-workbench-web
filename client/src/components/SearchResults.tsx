import type { ExperimentResults, Query, Sample } from '../../../shared/types';
import { Highlight } from './Highlight';

interface Props {
  results: ExperimentResults | null;
  queries: Query[];
  samples: Sample[];
}

export function SearchResults({ results, queries, samples }: Props) {
  const byId = new Map(samples.map((s) => [s.id, s]));
  return (
    <section className="card">
      <h3>检索结果</h3>
      {queries.length === 0 && <p className="muted">暂无查询。</p>}
      {queries.map((q) => {
        const qr = results?.searches.find((s) => s.queryId === q.id);
        const hits = qr?.hits ?? [];
        return (
          <div className="query-block" key={q.id}>
            <h4>
              查询 #{q.id} <q>{q.text}</q>{' '}
              <small>{hits.length} 个命中样本</small>
            </h4>
            {hits.length === 0 && <p className="muted">无命中</p>}
            {hits.map((h) => {
              const s = byId.get(h.sampleId);
              if (!s) return null;
              return (
                <div className="hit" key={h.sampleId}>
                  <span className="badge">#{h.sampleId}</span>
                  <Highlight text={s.text} ranges={h.ranges} />
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}

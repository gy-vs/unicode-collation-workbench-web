import type { Experiment, ExperimentPayload } from '../../../shared/types';
import { diffExperiments, isEmptyDiff } from '../diff';

interface Props {
  local: ExperimentPayload;
  server: Experiment;
  onUseServer: () => void;
  onForceLocal: () => void;
  onMerge: () => void;
  onClose: () => void;
}

/** 保存冲突对话框：展示本地与服务端的可合并差异，本地更改始终保留 */
export function ConflictDialog({ local, server, onUseServer, onForceLocal, onMerge, onClose }: Props) {
  const d = diffExperiments(local, server);
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="dialog">
        <h3>保存冲突</h3>
        <p>
          服务端当前为 <strong>r{server.revision}</strong>
          （更新于 {new Date(server.updatedAt).toLocaleString()}），你的修改基于旧版本，
          服务端已拒绝写入。<strong>本地更改未丢失。</strong>
        </p>

        {isEmptyDiff(d) ? (
          <p className="muted">内容与服务端一致，仅 revision 不同，可直接重新保存。</p>
        ) : (
          <div className="diff">
            {d.name && (
              <section>
                <h4>名称</h4>
                <p>
                  本地：{d.name.local} ／ 服务端：{d.name.server}
                </p>
              </section>
            )}
            {d.collation.length > 0 && (
              <section>
                <h4>排序配置</h4>
                <ul>
                  {d.collation.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
            )}
            {d.search.length > 0 && (
              <section>
                <h4>检索配置</h4>
                <ul>
                  {d.search.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
            )}
            <ListSection title="样本" diff={d.samples} />
            <ListSection title="查询" diff={d.queries} />
          </div>
        )}

        <div className="actions">
          <button onClick={onMerge} title="样本/查询按 id 取并集，冲突时以本地为准；名称与配置取本地">
            自动合并并保存
          </button>
          <button onClick={onForceLocal} title="以本地内容整体覆盖服务端当前版本">
            保留我的（覆盖服务端）
          </button>
          <button className="danger" onClick={onUseServer} title="丢弃本地更改，加载服务端版本">
            放弃本地，采用服务端
          </button>
          <button className="ghost" onClick={onClose}>
            继续编辑（暂不保存）
          </button>
        </div>
      </div>
    </div>
  );
}

function ListSection({
  title,
  diff,
}: {
  title: string;
  diff: { added: { id: number; text: string }[]; removed: { id: number; text: string }[]; changed: { id: number; local: { text: string }; server: { text: string } }[] };
}) {
  if (diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0) return null;
  return (
    <section>
      <h4>{title}</h4>
      <ul>
        {diff.added.map((r) => (
          <li key={`a${r.id}`}>
            <span className="tag add">本地新增</span> #{r.id} “{r.text}”
          </li>
        ))}
        {diff.removed.map((r) => (
          <li key={`r${r.id}`}>
            <span className="tag del">本地已删</span> #{r.id} “{r.text}”
          </li>
        ))}
        {diff.changed.map((c) => (
          <li key={`c${c.id}`}>
            <span className="tag mod">双方修改</span> #{c.id} 本地“{c.local.text}” ／ 服务端“
            {c.server.text}”
          </li>
        ))}
      </ul>
    </section>
  );
}

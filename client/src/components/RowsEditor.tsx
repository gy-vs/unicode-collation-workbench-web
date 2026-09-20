interface Row {
  id: number;
  text: string;
}

interface Props<T extends Row> {
  title: string;
  rows: T[];
  placeholder: string;
  onChange: (rows: T[]) => void;
}

export function RowsEditor<T extends Row>({ title, rows, placeholder, onChange }: Props<T>) {
  const nextId = rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  return (
    <section className="card">
      <h3>
        {title} <small>{rows.length} 行</small>
      </h3>
      <div className="rows">
        {rows.map((row) => (
          <div className="row" key={row.id}>
            <span className="badge">#{row.id}</span>
            <input
              value={row.text}
              placeholder={placeholder}
              onChange={(e) =>
                onChange(rows.map((r) => (r.id === row.id ? { ...r, text: e.target.value } : r)))
              }
            />
            <button
              className="icon"
              title="删除此行"
              onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button className="add" onClick={() => onChange([...rows, { id: nextId, text: '' } as T])}>
        + 添加一行
      </button>
    </section>
  );
}

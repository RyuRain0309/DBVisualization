import { useEngineStore } from '../../store/engineStore';

/** Rows from the most recent SELECT at or before the current step. */
export function ResultTable() {
  const steps = useEngineStore((state) => state.steps);
  const cursor = useEngineStore((state) => state.cursor);

  const rows = (() => {
    for (let i = Math.min(cursor, steps.length - 1); i >= 0; i -= 1) {
      const event = steps[i]!.event;
      if (event.type === 'rows-returned') return event.rows;
    }
    return null;
  })();

  if (!rows) return null;

  const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];

  return (
    <section className="result">
      <header className="result__header">
        <h2>SELECT 결과</h2>
        <span className="result__count">{rows.length}행</span>
      </header>

      {rows.length === 0 ? (
        <p className="result__empty">반환된 행이 없다.</p>
      ) : (
        <div className="result__scroll">
          <table className="result__table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {columns.map((column) => (
                    <td key={column}>{row[column] === null ? 'NULL' : String(row[column])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

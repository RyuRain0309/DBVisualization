import { useMemo } from 'react';
import { BTreeCanvas } from '../btree-view/BTreeCanvas';
import { highlightOf } from '../btree-view/highlight';
import { ExplanationFeed } from '../explanation/ExplanationFeed';
import { SqlInput } from '../sql-console/SqlInput';
import { StepControls } from '../sql-console/StepControls';
import { useEngineStore } from '../../store/engineStore';

const CAPACITIES = [3, 4, 5, 6, 8];

export function AppShell() {
  const steps = useEngineStore((state) => state.steps);
  const cursor = useEngineStore((state) => state.cursor);
  const session = useEngineStore((state) => state.session);
  // Recomputing this on every render would hand React a new object each time, so it is memoised
  // on the values that actually decide which snapshot is on screen.
  const snapshot = useMemo(
    () => (cursor >= 0 && steps[cursor] ? steps[cursor]!.snapshot : session.snapshot()),
    [steps, cursor, session],
  );
  const pageCapacity = useEngineStore((state) => state.pageCapacity);
  const setPageCapacity = useEngineStore((state) => state.setPageCapacity);
  const reset = useEngineStore((state) => state.reset);

  const highlight = highlightOf(steps[cursor]?.event ?? null);
  const transaction = snapshot.transaction;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__brand">
          <strong>InnoDB Visualizer</strong>
          <span>SQL 한 줄이 B+tree · 락 · redo/undo 에 남기는 흔적</span>
        </div>

        <div className="topbar__controls">
          <label className="field">
            페이지 용량
            <select
              value={pageCapacity}
              onChange={(event) => setPageCapacity(Number(event.target.value))}
            >
              {CAPACITIES.map((capacity) => (
                <option key={capacity} value={capacity}>
                  {capacity}개
                </option>
              ))}
            </select>
            <span
              className="field__note"
              title="실제 InnoDB 페이지는 16KB 로 수백 개 레코드를 담는다. 분할을 눈으로 보려고 낮춘 값이다."
            >
              단순화
            </span>
          </label>

          <span className={`badge ${transaction ? 'badge--active' : ''}`}>
            {transaction
              ? `TX ${transaction.id} 진행 중 · ${transaction.isolationLevel}${
                  transaction.implicit ? ' (autocommit)' : ''
                }`
              : `트랜잭션 없음 · ${snapshot.isolationLevel}`}
          </span>

          <button type="button" className="button" onClick={reset}>
            초기화
          </button>
        </div>
      </header>

      <main className="layout">
        <div className="layout__left">
          <SqlInput />
          <StepControls />
          <ExplanationFeed />
        </div>

        <div className="layout__center">
          {snapshot.tables.length === 0 ? (
            <p className="placeholder">
              먼저 CREATE TABLE 로 테이블을 만들면 클러스터드 인덱스와 세컨더리 인덱스 B+tree 가 여기에
              그려진다.
            </p>
          ) : (
            snapshot.tables.map((table) => (
              <section key={table.table.name} className="table-view">
                <h2 className="table-view__title">{table.table.name}</h2>
                {table.indexes.map((index) => (
                  <BTreeCanvas key={index.indexId} index={index} highlight={highlight} />
                ))}
              </section>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

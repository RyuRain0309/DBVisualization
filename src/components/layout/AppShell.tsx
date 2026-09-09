import { useMemo, useState } from 'react';
import { BTreeCanvas } from '../btree-view/BTreeCanvas';
import { TreeExplorer } from '../btree-view/TreeExplorer';
import { highlightOf, type Highlight } from '../btree-view/highlight';
import { ExplanationFeed } from '../explanation/ExplanationFeed';
import { IsolationEffectExplainer } from '../isolation/IsolationEffectExplainer';
import { LockLegend } from '../lock-panel/LockLegend';
import { LockTable } from '../lock-panel/LockTable';
import { RedoLogPanel } from '../log-panel/RedoLogPanel';
import { UndoLogPanel } from '../log-panel/UndoLogPanel';
import { Welcome } from '../onboarding/Welcome';
import { ConsoleWorkspace } from '../sql-console/ConsoleWorkspace';
import { ResultTable } from '../sql-console/ResultTable';
import { StepControls } from '../sql-console/StepControls';
import { SessionOverview } from '../session/SessionOverview';
import { useEngineStore } from '../../store/engineStore';
import {
  WorkspaceTabs,
  tabDefinitions,
  tabForEvent,
  type WorkspaceTab,
} from './WorkspaceTabs';
import type { EngineSnapshot } from '../../engine/executor/events';

const CAPACITIES = [3, 4, 5, 6, 8];

export function AppShell() {
  const started = useEngineStore((state) => state.started);
  const steps = useEngineStore((state) => state.steps);
  const cursor = useEngineStore((state) => state.cursor);
  const database = useEngineStore((state) => state.database);
  // Recomputing this on every render would hand React a new object each time, so it is memoised
  // on the values that actually decide which snapshot is on screen.
  const snapshot = useMemo(
    () => (cursor >= 0 && steps[cursor] ? steps[cursor]!.snapshot : database.snapshot()),
    [steps, cursor, database],
  );
  const pageCapacity = useEngineStore((state) => state.pageCapacity);
  const setPageCapacity = useEngineStore((state) => state.setPageCapacity);
  const reset = useEngineStore((state) => state.reset);

  const [tab, setTab] = useState<WorkspaceTab>('console');
  const currentEvent = steps[cursor]?.event ?? null;
  const highlight = highlightOf(currentEvent);

  if (!started) return <Welcome />;

  const waitingSessions = snapshot.sessions.filter((session) => session.waitingForTxId !== null);
  const openTransactions = snapshot.sessions.filter((session) => session.transaction !== null);

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

          <span className={`badge ${openTransactions.length > 0 ? 'badge--active' : ''}`}>
            열린 트랜잭션 {openTransactions.length}
          </span>
          {waitingSessions.length > 0 && (
            <span className="badge badge--wait">대기 {waitingSessions.length}</span>
          )}

          <button type="button" className="button" onClick={reset}>
            초기화
          </button>
        </div>
      </header>

      <StepControls />

      <main className="workspace">
        <WorkspaceTabs
          tabs={tabDefinitions(snapshot)}
          active={tab}
          flagged={tabForEvent(currentEvent)}
          onSelect={setTab}
        />
        <div className="workspace__body">
          <TabContent tab={tab} snapshot={snapshot} highlight={highlight} />
        </div>
      </main>
    </div>
  );
}

interface TabContentProps {
  tab: WorkspaceTab;
  snapshot: EngineSnapshot;
  highlight: Highlight;
}

function TabContent({ tab, snapshot, highlight }: TabContentProps) {
  if (tab === 'console') {
    return (
      <div className="pane pane--console">
        <ConsoleWorkspace snapshot={snapshot} />
        <SessionOverview snapshot={snapshot} />
      </div>
    );
  }

  if (tab === 'tree') {
    return (
      <div className="pane">
        <TreeExplorer snapshot={snapshot} highlight={highlight} />
      </div>
    );
  }

  if (tab === 'locks') {
    return (
      <div className="pane pane--locks">
        <div className="pane__side">
          <LockTable locks={snapshot.locks} sessions={snapshot.sessions} />
          <LockLegend />
        </div>
        <div className="pane__main">
          <Trees snapshot={snapshot} highlight={highlight} />
        </div>
      </div>
    );
  }

  if (tab === 'logs') {
    return (
      <div className="pane pane--split">
        <RedoLogPanel redo={snapshot.redo} />
        <UndoLogPanel undo={snapshot.undo} />
      </div>
    );
  }

  if (tab === 'mvcc') {
    return (
      <div className="pane pane--split">
        {snapshot.sessions.map((session) => (
          <IsolationEffectExplainer
            key={session.id}
            title={session.name}
            level={session.isolationLevel}
            readView={session.readView}
          />
        ))}
        <UndoLogPanel undo={snapshot.undo} />
      </div>
    );
  }

  return (
    <div className="pane pane--feed">
      <ExplanationFeed />
      <ResultTable />
    </div>
  );
}

function Trees({ snapshot, highlight }: { snapshot: EngineSnapshot; highlight: Highlight }) {
  if (snapshot.tables.length === 0) {
    return (
      <p className="placeholder">
        먼저 CREATE TABLE 로 테이블을 만들면 클러스터드 인덱스와 세컨더리 인덱스 B+tree 가 여기에
        그려진다.
      </p>
    );
  }

  return (
    <>
      {snapshot.tables.map((table) => (
        <section key={table.table.name} className="table-view">
          <h2 className="table-view__title">{table.table.name}</h2>
          {table.indexes.map((index) => (
            <BTreeCanvas
              key={index.indexId}
              index={index}
              highlight={highlight}
              locks={snapshot.locks}
            />
          ))}
        </section>
      ))}
    </>
  );
}

import type { EngineSnapshot, StepEvent } from '../../engine/executor/events';

export type WorkspaceTab = 'console' | 'tree' | 'locks' | 'logs' | 'arch' | 'mvcc' | 'feed';

export interface TabDefinition {
  id: WorkspaceTab;
  label: string;
  hint: string;
  badge?: string;
}

/** Which tab the current step is about, so its button can flag that something happened there. */
export function tabForEvent(event: StepEvent | null): WorkspaceTab | null {
  if (!event) return null;
  switch (event.type) {
    case 'index-traverse':
    case 'btree-mutation':
    case 'purge':
      return 'tree';
    case 'lock-acquire':
    case 'lock-release':
      return 'locks';
    case 'page-load':
    case 'page-flush':
    case 'checkpoint':
      return 'arch';
    case 'redo-append':
    case 'redo-flush':
    case 'undo-append':
    case 'undo-apply':
    case 'undo-retain':
      return 'logs';
    case 'read-view-create':
    case 'visibility-check':
    case 'isolation-change':
      return 'mvcc';
    case 'rows-returned':
      return 'feed';
    case 'lock-wait':
    case 'lock-granted':
    case 'deadlock':
      return 'locks';
    case 'transaction-begin':
    case 'transaction-commit':
    case 'transaction-rollback':
      return 'console';
    default:
      return null;
  }
}

export function tabDefinitions(snapshot: EngineSnapshot): TabDefinition[] {
  const pendingRedo = snapshot.redo.records.filter(
    (record) => record.lsn > snapshot.redo.flushedUpToLsn,
  ).length;

  const waiting = snapshot.sessions.filter((session) => session.waitingForTxId !== null).length;

  return [
    {
      id: 'console',
      label: 'SQL 콘솔',
      hint: '세션별 콘솔에서 문장을 실행한다',
      badge:
        waiting > 0 ? `대기 ${waiting}` : `${snapshot.sessions.length} 세션`,
    },
    {
      id: 'tree',
      label: 'B+tree',
      hint: '클러스터드 · 세컨더리 인덱스 구조',
      badge: snapshot.tables.length > 0 ? `${snapshot.tables.length} 테이블` : undefined,
    },
    {
      id: 'locks',
      label: '락',
      hint: '레코드 · 갭 · 넥스트키 락 위치',
      badge: snapshot.locks.length > 0 ? `${snapshot.locks.length}` : undefined,
    },
    {
      id: 'logs',
      label: 'Redo / Undo',
      hint: 'WAL 순서와 버전 체인',
      badge: pendingRedo > 0 ? `미flush ${pendingRedo}` : undefined,
    },
    {
      id: 'arch',
      label: '아키텍처',
      hint: '버퍼 풀 · 로그 · 테이블스페이스 · 파일',
      badge: snapshot.bufferPool.dirtyCount > 0 ? `더티 ${snapshot.bufferPool.dirtyCount}` : undefined,
    },
    {
      id: 'mvcc',
      label: '격리수준 · MVCC',
      hint: 'read view 수명과 가시성',
      badge: snapshot.sessions.some((session) => session.readView) ? 'read view' : undefined,
    },
    {
      id: 'feed',
      label: '단계별 설명',
      hint: '엔진이 수행한 단계와 SELECT 결과',
    },
  ];
}

interface Props {
  tabs: TabDefinition[];
  active: WorkspaceTab;
  flagged: WorkspaceTab | null;
  onSelect: (tab: WorkspaceTab) => void;
}

export function WorkspaceTabs({ tabs, active, flagged, onSelect }: Props) {
  return (
    <nav className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          title={tab.hint}
          className={`tab ${tab.id === active ? 'tab--active' : ''}`}
          onClick={() => onSelect(tab.id)}
        >
          <span className="tab__label">{tab.label}</span>
          {tab.badge && <span className="tab__badge">{tab.badge}</span>}
          {flagged === tab.id && tab.id !== active && <span className="tab__dot" />}
        </button>
      ))}
    </nav>
  );
}

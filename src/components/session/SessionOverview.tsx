import type { EngineSnapshot } from '../../engine/executor/events';

/** Who is running what, and who is stuck behind whom. */
export function SessionOverview({ snapshot }: { snapshot: EngineSnapshot }) {
  const lockCountOf = (txId: number) =>
    snapshot.locks.filter((lock) => lock.txId === txId).length;

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>세션 현황</h2>
        <span className="panel__count">{snapshot.sessions.length}개 연결</span>
      </header>

      <ul className="sessions">
        {snapshot.sessions.map((session) => {
          const tx = session.transaction;
          return (
            <li key={session.id} className="sessions__item">
              <div className="sessions__row">
                <strong>{session.name}</strong>
                <span className="sessions__iso">{session.isolationLevel}</span>
              </div>

              <div className="sessions__row sessions__row--dim">
                {tx ? (
                  <span>
                    TX {tx.id} 진행 중{tx.implicit ? ' (autocommit)' : ''} · 락 {lockCountOf(tx.id)}개
                    · undo {tx.undoRecordCount}건
                  </span>
                ) : (
                  <span>트랜잭션 없음</span>
                )}
              </div>

              {session.waitingForTxId !== null && (
                <div className="sessions__wait">
                  TX {session.waitingForTxId} 의 락을 기다리는 중
                  {session.pendingSql && <code>{session.pendingSql}</code>}
                </div>
              )}

              {session.readView && (
                <div className="sessions__row sessions__row--dim">
                  read view 보유 · 가시 경계 {session.readView.minTrxId}~{session.readView.maxTrxId}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

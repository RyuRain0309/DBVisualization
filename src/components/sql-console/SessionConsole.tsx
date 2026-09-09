import type { KeyboardEvent } from 'react';
import type { SessionSnapshot } from '../../engine/executor/events';
import { ISOLATION_LEVELS } from '../../engine/transaction/isolationLevel';
import { useEngineStore, type ConsoleState } from '../../store/engineStore';

interface Props {
  console: ConsoleState;
  session: SessionSnapshot | undefined;
  removable: boolean;
}

export function SessionConsole({ console, session, removable }: Props) {
  const setSql = useEngineStore((state) => state.setSql);
  const run = useEngineStore((state) => state.run);
  const runSql = useEngineStore((state) => state.runSql);
  const removeConsole = useEngineStore((state) => state.removeConsole);

  const transaction = session?.transaction ?? null;
  const waiting = session?.waitingForTxId ?? null;

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      run(console.sessionId);
    }
  };

  return (
    <section className={`console ${waiting !== null ? 'console--waiting' : ''}`}>
      <header className="console__header">
        <div className="console__title">
          <h3>{console.name}</h3>
          {transaction ? (
            <span className="badge badge--active">
              TX {transaction.id}
              {transaction.implicit ? ' (autocommit)' : ''}
            </span>
          ) : (
            <span className="badge">트랜잭션 없음</span>
          )}
          {waiting !== null && <span className="badge badge--wait">TX {waiting} 대기 중</span>}
        </div>

        <div className="console__meta">
          <select
            className="console__isolation"
            value={session?.isolationLevel ?? 'REPEATABLE READ'}
            disabled={transaction !== null}
            title={
              transaction
                ? '트랜잭션이 열려 있는 동안에는 바꿀 수 없다. 다음 트랜잭션부터 적용되기 때문이다.'
                : '이 세션의 격리수준'
            }
            onChange={(event) =>
              runSql(console.sessionId, `SET TRANSACTION ISOLATION LEVEL ${event.target.value}`)
            }
          >
            {ISOLATION_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>

          {removable && (
            <button
              type="button"
              className="button button--ghost"
              title="세션을 끊는다. 열려 있던 트랜잭션은 롤백된다."
              onClick={() => removeConsole(console.sessionId)}
            >
              닫기
            </button>
          )}
        </div>
      </header>

      <textarea
        className="console__editor"
        value={console.sql}
        spellCheck={false}
        onChange={(event) => setSql(console.sessionId, event.target.value)}
        onKeyDown={onKeyDown}
      />

      <div className="console__actions">
        <button
          type="button"
          className="button button--primary"
          onClick={() => run(console.sessionId)}
        >
          실행 <span className="button__hint">⌘↵</span>
        </button>
        <button
          type="button"
          className="button"
          onClick={() => runSql(console.sessionId, 'BEGIN')}
        >
          BEGIN
        </button>
        <button
          type="button"
          className="button"
          onClick={() => runSql(console.sessionId, 'COMMIT')}
          disabled={!transaction}
        >
          COMMIT
        </button>
        <button
          type="button"
          className="button"
          onClick={() => runSql(console.sessionId, 'ROLLBACK')}
          disabled={!transaction}
        >
          ROLLBACK
        </button>
      </div>

      {waiting !== null && session?.pendingSql && (
        <p className="console__waiting">
          대기 중인 문장: <code>{session.pendingSql}</code>
          <br />
          트랜잭션 {waiting} 이 COMMIT/ROLLBACK 되면 자동으로 이어서 실행된다.
        </p>
      )}

      {console.error && <p className="console__error">{console.error}</p>}
    </section>
  );
}

import { AnimatePresence, motion } from 'framer-motion';
import type { UndoLogRecord } from '../../engine/logs/undoLog';
import { formatKey } from '../../engine/schema/record';

const STATE_LABEL: Record<UndoLogRecord['state'], string> = {
  active: '활성 (롤백 대상)',
  retained: 'MVCC 용 보관',
  purged: 'purge 됨',
};

const KIND_HINT: Record<UndoLogRecord['kind'], string> = {
  INSERT_UNDO: '롤백하면 이 행을 지운다',
  UPDATE_UNDO: '이전 이미지 보관 · MVCC 버전 체인의 한 칸',
  DELETE_UNDO: '전체 이미지 보관 · 롤백하면 되살린다',
};

export function UndoLogPanel({ undo }: { undo: UndoLogRecord[] }) {
  const active = undo.filter((record) => record.state === 'active').length;

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>Undo 로그</h2>
        <span className="panel__count">
          {undo.length}건 · 활성 {active}건
        </span>
      </header>

      <p className="panel__note">
        롤백에도 쓰이고, 다른 트랜잭션이 옛 버전을 읽을 때도 이 체인을 따라간다.
      </p>

      <ul className="log-list">
        <AnimatePresence initial={false}>
          {[...undo]
            .reverse()
            .slice(0, 40)
            .map((record) => (
              <motion.li
                key={record.undoNo}
                className={`log-list__item log-list__item--${record.state}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                title={KIND_HINT[record.kind]}
              >
                <span className="log-list__lsn">#{record.undoNo}</span>
                <span className="log-list__kind">{record.kind}</span>
                <span className="log-list__note">
                  PK ({formatKey(record.primaryKey)})
                  {record.rollPtr !== null && ` · 이전 버전 #${record.rollPtr}`}
                </span>
                <span className={`log-state log-state--${record.state}`}>
                  {STATE_LABEL[record.state]}
                </span>
              </motion.li>
            ))}
        </AnimatePresence>
      </ul>

      {undo.length === 0 && <p className="panel__empty">아직 기록된 undo 가 없다.</p>}
    </section>
  );
}

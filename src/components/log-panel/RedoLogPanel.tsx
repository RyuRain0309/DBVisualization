import { AnimatePresence, motion } from 'framer-motion';
import type { RedoLogState } from '../../engine/logs/redoLog';

export function RedoLogPanel({ redo }: { redo: RedoLogState }) {
  const pending = redo.records.filter((record) => record.lsn > redo.flushedUpToLsn).length;

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>Redo 로그</h2>
        <span className="panel__count">
          {redo.records.length}건 · 미flush {pending}건
        </span>
      </header>

      <p className="panel__note">
        페이지를 바꾸기 전에 로그부터 쌓고(WAL), 커밋 시점에 디스크로 내린다.
      </p>

      <ul className="log-list">
        <AnimatePresence initial={false}>
          {redo.records
            .slice(-40)
            .reverse()
            .map((record) => {
              const durable = record.lsn <= redo.flushedUpToLsn;
              return (
                <motion.li
                  key={record.lsn}
                  className={`log-list__item ${durable ? 'log-list__item--durable' : ''}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <span className="log-list__lsn">LSN {record.lsn}</span>
                  <span className="log-list__kind">{record.kind}</span>
                  <span className="log-list__note">{record.note}</span>
                  <span className={`log-state ${durable ? 'log-state--durable' : ''}`}>
                    {durable ? '디스크' : '버퍼'}
                  </span>
                </motion.li>
              );
            })}
        </AnimatePresence>
      </ul>

      {redo.records.length === 0 && <p className="panel__empty">아직 기록된 redo 가 없다.</p>}
    </section>
  );
}

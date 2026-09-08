import { AnimatePresence, motion } from 'framer-motion';
import { describeLockTarget } from '../../engine/locks/lockManager';
import type { Lock } from '../../engine/locks/types';

const GRANULARITY_LABEL: Record<string, string> = {
  TABLE: '테이블',
  RECORD: '레코드',
  GAP: '갭',
  NEXT_KEY: '넥스트키',
  INSERT_INTENTION: '삽입 의도',
  AUTO_INC: 'AUTO_INC',
};

export function LockTable({ locks }: { locks: Lock[] }) {
  return (
    <section className="panel">
      <header className="panel__header">
        <h2>보유 중인 락</h2>
        <span className="panel__count">{locks.length}</span>
      </header>

      {locks.length === 0 ? (
        <p className="panel__empty">
          잡고 있는 락이 없다. 락은 COMMIT/ROLLBACK 시점에 한꺼번에 풀린다.
        </p>
      ) : (
        <ul className="lock-list">
          <AnimatePresence initial={false}>
            {locks.map((lock) => (
              <motion.li
                key={lock.id}
                className="lock-list__item"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                title={lock.reason}
              >
                <span className={`lock-mode lock-mode--${lock.mode}`}>{lock.mode}</span>
                <span className="lock-list__granularity">
                  {GRANULARITY_LABEL[lock.target.granularity]}
                </span>
                <span className="lock-list__target">{describeLockTarget(lock.target)}</span>
                <span className="lock-list__tx">TX {lock.txId}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

import { useEffect, useRef } from 'react';
import type { StepEvent } from '../../engine/executor/events';
import { useEngineStore } from '../../store/engineStore';

const LABELS: Record<StepEvent['type'], string> = {
  'statement-start': '문장',
  'statement-end': '완료',
  'table-created': 'DDL',
  'transaction-begin': 'TX',
  'transaction-commit': 'TX',
  'transaction-rollback': 'TX',
  'isolation-change': '격리',
  'index-traverse': '탐색',
  'btree-mutation': 'B+tree',
  'redo-append': 'redo',
  'redo-flush': 'redo',
  'undo-append': 'undo',
  'undo-apply': 'undo',
  'undo-retain': 'undo',
  purge: 'purge',
  'read-view-create': 'MVCC',
  'visibility-check': 'MVCC',
  'lock-acquire': '락',
  'lock-release': '락',
  'rows-returned': '결과',
  note: '설명',
};

export function ExplanationFeed() {
  const steps = useEngineStore((state) => state.steps);
  const cursor = useEngineStore((state) => state.cursor);
  const setCursor = useEngineStore((state) => state.setCursor);
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [cursor]);

  return (
    <section className="feed">
      <header className="feed__header">
        <h2>단계별 설명</h2>
        <span className="feed__hint">각 줄은 엔진이 실제로 수행한 한 단계다</span>
      </header>

      <ol className="feed__list">
        {steps.map((step, index) => {
          const isActive = index === cursor;
          const isFuture = index > cursor;
          return (
            <li
              key={index}
              ref={isActive ? activeRef : undefined}
              className={`feed__item ${isActive ? 'feed__item--active' : ''} ${
                isFuture ? 'feed__item--future' : ''
              }`}
              onClick={() => setCursor(index)}
            >
              <span className={`feed__tag feed__tag--${step.event.type}`}>
                {LABELS[step.event.type]}
              </span>
              <span className="feed__text">{step.event.explanation}</span>
            </li>
          );
        })}
        {steps.length === 0 && <li className="feed__item feed__item--empty">아직 실행 기록이 없다.</li>}
      </ol>
    </section>
  );
}

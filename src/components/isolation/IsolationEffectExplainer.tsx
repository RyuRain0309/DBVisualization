import type { ReadView } from '../../engine/mvcc/readView';
import { describeReadView } from '../../engine/mvcc/readView';
import { ISOLATION_BEHAVIOR, type IsolationLevel } from '../../engine/transaction/isolationLevel';

const POLICY_LABEL: Record<string, string> = {
  none: '만들지 않음 (최신 버전 직접 읽기)',
  'per-statement': '문장마다 새로 생성',
  'per-transaction': '트랜잭션 첫 읽기에서 한 번',
};

interface Props {
  level: IsolationLevel;
  readView: ReadView | null;
}

export function IsolationEffectExplainer({ level, readView }: Props) {
  const behavior = ISOLATION_BEHAVIOR[level];

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>격리수준 {level}</h2>
      </header>

      <p className="panel__note">{behavior.description}</p>

      <dl className="facts">
        <div>
          <dt>갭 락</dt>
          <dd>{behavior.gapLocking ? '사용 (넥스트키 락으로 팬텀 차단)' : '사용 안 함'}</dd>
        </div>
        <div>
          <dt>read view</dt>
          <dd>{POLICY_LABEL[behavior.readViewPolicy]}</dd>
        </div>
        <div>
          <dt>일반 SELECT</dt>
          <dd>{behavior.plainSelectLocks ? 'S 락을 잡는 잠금 읽기' : '락 없이 MVCC 로 읽음'}</dd>
        </div>
      </dl>

      <div className="read-view">
        <span className="read-view__label">현재 read view</span>
        <span className="read-view__value">
          {readView ? describeReadView(readView) : '없음'}
        </span>
      </div>
    </section>
  );
}

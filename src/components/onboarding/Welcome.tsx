import { useEngineStore } from '../../store/engineStore';

const KEYWORDS = ['B+tree', '레코드 · 갭 락', 'redo / undo', 'MVCC'];

/** A tiny B+tree: one root, two leaves. */
function Mark() {
  return (
    <svg className="welcome__mark" viewBox="0 0 72 56" role="img" aria-label="InnoDB Visualizer">
      <path className="welcome__mark-edge" d="M36 20 C 36 30, 18 28, 18 36" />
      <path className="welcome__mark-edge" d="M36 20 C 36 30, 54 28, 54 36" />
      <rect className="welcome__mark-node" x="22" y="6" width="28" height="14" rx="4" />
      <rect className="welcome__mark-leaf" x="4" y="36" width="28" height="14" rx="4" />
      <rect className="welcome__mark-leaf" x="40" y="36" width="28" height="14" rx="4" />
    </svg>
  );
}

export function Welcome() {
  const start = useEngineStore((state) => state.start);

  return (
    <div className="welcome">
      <div className="welcome__inner">
        <Mark />
        <h1 className="welcome__title">InnoDB Visualizer</h1>
        <p className="welcome__lead">
          SQL 한 줄이 InnoDB 안에서 무슨 일을 하는지 한 단계씩 펼쳐 본다.
        </p>

        <ul className="welcome__keywords">
          {KEYWORDS.map((keyword) => (
            <li key={keyword}>{keyword}</li>
          ))}
        </ul>

        <button type="button" className="button button--primary button--large" onClick={start}>
          시작하기
        </button>

        <p className="welcome__foot">실제 MySQL 에 연결하지 않는 브라우저 시뮬레이터</p>
      </div>
    </div>
  );
}

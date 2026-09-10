import { AppMark } from './AppMark';
import { useEngineStore } from '../../store/engineStore';

const KEYWORDS = ['B+tree', '레코드 · 갭 락', 'redo / undo', 'MVCC'];

export function Welcome() {
  const start = useEngineStore((state) => state.start);
  const openDocs = useEngineStore((state) => state.openDocs);

  return (
    <div className="welcome">
      <div className="welcome__inner">
        <AppMark className="welcome__mark" />
        <h1 className="welcome__title">InnoDB Visualizer</h1>
        <p className="welcome__lead">
          InnoDB 안에서 일어나는 일들을 직접 확인하세요.
        </p>

        <ul className="welcome__keywords">
          {KEYWORDS.map((keyword) => (
            <li key={keyword}>{keyword}</li>
          ))}
        </ul>

        <div className="welcome__actions">
          <button type="button" className="button button--primary button--large" onClick={start}>
            시작하기
          </button>
          <button type="button" className="button button--large" onClick={openDocs}>
            문서
          </button>
        </div>

        <p className="welcome__foot">InnoDB 기반 시각화 시뮬레이터</p>
      </div>
    </div>
  );
}

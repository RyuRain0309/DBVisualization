import { DolphinMark } from './DolphinMark';
import { useEngineStore } from '../../store/engineStore';

const KEYWORDS = ['B+tree', '레코드 · 갭 락', 'redo / undo', 'MVCC'];

export function Welcome() {
  const start = useEngineStore((state) => state.start);

  return (
    <div className="welcome">
      <div className="welcome__inner">
        <DolphinMark className="welcome__mark" />
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

import { AppMark } from './AppMark';
import { useRoute } from '../../router';
import { SIMULATOR_ENABLED } from '../../features';

const KEYWORDS = ['B+tree', '레코드 · 갭 락', 'redo / undo', 'MVCC'];

export function Welcome() {
  const [, navigate] = useRoute();

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
          {SIMULATOR_ENABLED && (
            <button type="button" className="button button--primary button--large" onClick={() => navigate({ view: 'app', param: null })}>
              시작하기
            </button>
          )}
          <button
            type="button"
            className={`button button--large ${SIMULATOR_ENABLED ? '' : 'button--primary'}`}
            onClick={() => navigate({ view: 'docs', param: null })}
          >
            문서
          </button>
          <button type="button" className="button button--large" onClick={() => navigate({ view: 'ibd', param: null })}>
            파일 분석
          </button>
        </div>

        <p className="welcome__foot">InnoDB 기반 시각화 시뮬레이터</p>
      </div>
    </div>
  );
}

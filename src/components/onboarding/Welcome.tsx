import { useEngineStore } from '../../store/engineStore';

const POINTS: { title: string; body: string }[] = [
  {
    title: 'B+tree 가 어떻게 변하는가',
    body: 'INSERT 몇 번에 리프 페이지가 가득 차 분할되고, DELETE 로 절반 아래로 비면 형제와 병합된다. 클러스터드 인덱스 리프에는 행 전체가, 세컨더리 인덱스 리프에는 PK 만 들어간다는 차이도 그대로 보인다.',
  },
  {
    title: '어디에 락이 걸리는가',
    body: '레코드 락, 갭 락, 넥스트키 락, 테이블 의도 락을 목록으로도 보여주고 트리 위 정확한 위치에 표시한다. 조건에 맞는 행이 없어도 갭을 잠그는 이유, 유니크 조회에서 넥스트키가 레코드 락으로 줄어드는 이유를 눈으로 확인할 수 있다.',
  },
  {
    title: 'redo / undo 는 언제 쓰이는가',
    body: '페이지를 바꾸기 전에 로그부터 쌓고 커밋 때 디스크로 내리는 WAL 순서, 롤백이 undo 를 거꾸로 적용하는 과정, 그 undo 가 MVCC 버전 체인으로 재사용되는 흐름을 단계별로 따라간다.',
  },
  {
    title: '격리수준은 무엇을 바꾸는가',
    body: '같은 SQL 을 격리수준만 바꿔 실행하면 갭 락 사용 여부와 read view 수명이 달라진다. 세션을 여러 개 열어 서로 락을 기다리게 하거나 데드락을 만들어 볼 수도 있다.',
  },
];

export function Welcome() {
  const start = useEngineStore((state) => state.start);

  return (
    <div className="welcome">
      <div className="welcome__inner">
        <p className="welcome__eyebrow">MySQL InnoDB 스토리지 엔진 시각화</p>
        <h1 className="welcome__title">SQL 한 줄이 InnoDB 안에서 하는 일을 전부 펼쳐본다</h1>
        <p className="welcome__lead">
          실제 MySQL 에 연결하지 않는다. 브라우저 안에서 도는 시뮬레이터가 B+tree, 락, redo/undo 로그,
          MVCC 를 직접 모델링해, 문장을 실행하면 무슨 일이 어떤 순서로 일어나는지 한 단계씩 보여준다.
        </p>

        <ul className="welcome__points">
          {POINTS.map((point) => (
            <li key={point.title}>
              <h2>{point.title}</h2>
              <p>{point.body}</p>
            </li>
          ))}
        </ul>

        <div className="welcome__note">
          <strong>교육용으로 줄인 부분</strong>
          <span>
            페이지 용량이 기본 4건이다 (실제 InnoDB 페이지는 16KB 로 수백 건). redo 는 물리 포맷 대신
            읽을 수 있는 설명으로 남기고, purge 는 백그라운드가 아니라 커밋 직후에 돈다. 화면에도
            표시해 두었다.
          </span>
        </div>

        <button type="button" className="button button--primary button--large" onClick={start}>
          시작하기
        </button>
      </div>
    </div>
  );
}

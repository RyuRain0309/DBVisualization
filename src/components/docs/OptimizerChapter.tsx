import { Block, Figure, Note, Roles } from './parts';

interface Stage {
  name: string;
  work: string;
  output: string;
  layer: 'server' | 'engine';
}

const STAGES: Stage[] = [
  {
    name: '파서',
    work: 'SQL 문자열을 토큰으로 쪼개고 문법 규칙에 맞춰 트리로 만든다. 문법 오류는 전부 여기서 걸린다',
    output: '파스 트리',
    layer: 'server',
  },
  {
    name: '해석 · 권한 확인',
    work: '이름으로만 적힌 테이블과 컬럼을 실제 객체에 묶고, 없는 컬럼이나 권한 없는 접근을 걸러낸다',
    output: '해석된 트리',
    layer: 'server',
  },
  {
    name: '변환',
    work: '결과가 같은 더 다루기 쉬운 형태로 고쳐 쓴다 — 상수 계산, 서브쿼리 평탄화, 필요 없는 외부 조인 제거',
    output: '정리된 트리',
    layer: 'server',
  },
  {
    name: '최적화',
    work: '통계를 보고 테이블마다 어떤 인덱스로 접근할지, 조인은 어떤 순서로 돌릴지 비용을 따져 고른다',
    output: '실행 계획',
    layer: 'server',
  },
  {
    name: '실행',
    work: '계획을 그대로 따라가며 엔진의 handler 함수를 호출한다 — index_read, index_next, update_row',
    output: 'handler 호출',
    layer: 'server',
  },
  {
    name: 'InnoDB',
    work: 'B+tree 를 타고 페이지를 버퍼 풀로 올리고, 락을 걸고, read view 로 볼 버전을 정해 행을 돌려준다',
    output: '행',
    layer: 'engine',
  },
];

/**
 * The server-layer half of the picture. It matters here because the plan decides which index the
 * engine walks, and that decides how much of the tree gets locked and read.
 */
export function OptimizerChapter() {
  return (
    <>
      <p className="doc-lead">
        SQL 문자열은 InnoDB 까지 내려가지 않는다. 파서 · 옵티마이저 · 실행기는 모든 스토리지 엔진이
        함께 쓰는 <strong>서버 레이어</strong>의 몫이고, 엔진이 받는 건 이미 <strong>행 단위 요청</strong>
        으로 번역된 명령이다. 어떤 인덱스를 탈지는 그 번역 과정에서 정해진다.
      </p>

      <Figure caption="한 문장이 행이 되어 돌아오기까지. 마지막 칸만 InnoDB 이고, 위 다섯 칸은 엔진과 무관하게 똑같이 돈다.">
        <ol className="pipe">
          {STAGES.map((stage) => (
            <li key={stage.name} className={`pipe__stage pipe__stage--${stage.layer}`}>
              <span className="pipe__name">{stage.name}</span>
              <span className="pipe__work">{stage.work}</span>
              <span className="pipe__out">{stage.output}</span>
            </li>
          ))}
        </ol>
      </Figure>

      <Block title="옵티마이저가 보고 판단하는 것">
        <p>
          옵티마이저는 데이터를 직접 세어 보지 않는다. 가진 건 <b>통계와 비용 상수</b>뿐이고, 그걸로
          계획마다 예상 비용을 매겨 가장 싼 것을 고른다.
        </p>
        <Roles
          rows={[
            [
              '인덱스 카디널리티',
              <>
                인덱스 컬럼에 서로 다른 값이 몇 개나 되는지. 페이지를 무작위로 몇 장 떠 보는{' '}
                <b>샘플링</b>으로 구한 추정값이라 틀릴 수 있다. <code>ANALYZE TABLE</code> 로 다시
                계산한다.
              </>,
            ],
            [
              '인덱스 다이브',
              <>
                범위 조건은 통계만으로 부족해서, 실제 B+tree 에서 구간의 양 끝을 찔러 보고 그 사이에
                행이 몇 개쯤 있는지 센다.
              </>,
            ],
            [
              '비용 상수',
              <>
                페이지 한 장을 읽는 값, 행 하나를 비교하는 값 등이 표로 정해져 있다. IO 비용과 CPU
                비용을 더해 하나의 숫자로 만든다.
              </>,
            ],
          ]}
        />
        <p>
          그래서 <b>인덱스가 있어도 안 쓰는</b> 선택이 나온다. 세컨더리 인덱스로 찾으면 매칭된 행마다
          PK 로 클러스터드 인덱스를 한 번 더 타야 하는데, 매칭이 많아지면 그 왕복 비용이 테이블을 처음부터
          쭉 읽는 비용을 넘어선다.
        </p>

        <Figure caption="조건에 맞는 행이 적을 때는 인덱스가 압도적으로 싸지만, 비율이 올라가면 리프 오프 비용이 쌓여 역전된다. 옵티마이저는 이 교차점을 비용으로 계산한다.">
          <CostCrossoverChart />
        </Figure>
      </Block>

      <Block title="접근 방법 — 계획의 핵심">
        <p>
          실행 계획에서 가장 중요한 한 칸은 테이블마다 정해지는 접근 방법이다. 위에서 아래로 갈수록
          읽는 양이 많아진다.
        </p>
        <Roles
          rows={[
            ['const · eq_ref', <>PK 나 유니크 인덱스로 <b>많아야 한 행</b>. 가장 싸다</>],
            ['ref', <>유니크가 아닌 인덱스의 등호 조건. 같은 값이 여러 행일 수 있다</>],
            ['range', <><code>BETWEEN</code> · <code>&gt;</code> · <code>IN</code> 처럼 리프의 한 구간만 훑는다</>],
            ['index', <>인덱스 전체를 훑는다. 테이블 전체보다는 작지만 여전히 전부다</>],
            ['ALL', <>클러스터드 인덱스 리프를 처음부터 끝까지. 풀 테이블 스캔</>],
          ]}
        />
        <p>
          여기에 <b>커버링 인덱스</b>(필요한 컬럼이 인덱스에 다 있어 리프 오프가 없음)와{' '}
          <b>인덱스 머지</b>(인덱스 두 개로 각각 찾아 결과를 합침)가 덧붙는다. 조인은 기본적으로 앞
          테이블의 행마다 뒤 테이블을 찾아보는 중첩 루프이고, 조인할 인덱스가 없는 등호 조인이면 8.0
          부터는 해시 조인을 쓴다. 조인 순서도 옵티마이저가 바꾼다 — 적게 남는 테이블을 먼저 두는 편이
          싸기 때문이다.
        </p>
      </Block>

      <Block title="EXPLAIN 으로 계획 읽기">
        <p>
          <code>EXPLAIN</code> 은 실행하지 않고 계획만 보여 준다. 숫자는 전부 <b>추정치</b>다.
        </p>
        <Figure caption="EXPLAIN SELECT id FROM users WHERE email = 'a@x.com' 의 결과를 한 줄로 편 모습. 필요한 컬럼이 email 과 PK 뿐이라 세컨더리 인덱스만으로 끝난다.">
          <ul className="explain">
            <li>
              <code>type</code>
              <b>ref</b>
              <span>접근 방법. ALL 이 나오면 인덱스를 못 썼다는 뜻이다</span>
            </li>
            <li>
              <code>key</code>
              <b>idx_email</b>
              <span>실제로 고른 인덱스. possible_keys 에 있는데 여기 없으면 비용 때문에 버린 것</span>
            </li>
            <li>
              <code>rows</code>
              <b>1</b>
              <span>이 단계에서 읽을 것으로 <b>추정한</b> 행 수</span>
            </li>
            <li>
              <code>filtered</code>
              <b>100.00</b>
              <span>읽은 행 중 조건을 통과할 비율 추정. rows × filtered 가 다음 단계로 넘어간다</span>
            </li>
            <li>
              <code>Extra</code>
              <b>Using index</b>
              <span>
                커버링 인덱스라 리프 오프가 없다는 뜻. <code>Using filesort</code> ·{' '}
                <code>Using temporary</code> 가 보이면 정렬 · 임시 테이블이 생겼다는 신호다
              </span>
            </li>
          </ul>
        </Figure>
        <p>
          추정이 맞았는지 보려면 <code>EXPLAIN ANALYZE</code> 로 실제 실행 시간과 실측 행 수를 함께
          본다. 추정 행 수와 실측이 크게 어긋나는 지점이 대개 느린 질의의 원인이다 — 통계가 낡았거나,
          옵티마이저가 조건의 선택도를 잘못 본 것이다.
        </p>
        <Note>
          이 시뮬레이터에는 옵티마이저가 없다. 파서가 만든 문장을 실행기가 그대로 실행하고, 접근 방법은
          비용 계산 없이 규칙으로 고른다 — PK 등호면 단일 조회, PK 조건이면 범위 스캔, WHERE 첫 컬럼이
          세컨더리 인덱스의 선두 컬럼이면 그 인덱스, 아니면 풀 스캔. 통계 · 조인 최적화 · EXPLAIN 은
          다루지 않는다.
        </Note>
      </Block>
    </>
  );
}

/** Index range vs full scan: two cost lines and the point where they cross. */
function CostCrossoverChart() {
  return (
    <svg className="cost" viewBox="0 0 570 240" role="img" aria-label="인덱스와 풀 스캔의 비용 교차">
      <line className="cost__axis" x1="60" y1="30" x2="60" y2="190" />
      <line className="cost__axis" x1="60" y1="190" x2="545" y2="190" />

      <text className="cost__axis-label" x="52" y="36" textAnchor="end">
        비용
      </text>
      <text className="cost__axis-label" x="60" y="208">
        0%
      </text>
      <text className="cost__axis-label" x="545" y="208" textAnchor="end">
        100%
      </text>
      <text className="cost__axis-label" x="300" y="228" textAnchor="middle">
        조건에 맞는 행의 비율 →
      </text>

      <line className="cost__line cost__line--scan" x1="60" y1="110" x2="540" y2="110" />
      <text className="cost__tag cost__tag--scan" x="536" y="126" textAnchor="end">
        풀 스캔 — 행 수와 무관하게 일정
      </text>

      <line className="cost__line cost__line--index" x1="60" y1="175" x2="540" y2="50" />
      <text className="cost__tag cost__tag--index" x="536" y="44" textAnchor="end">
        세컨더리 인덱스 + 리프 오프
      </text>

      <line className="cost__cross" x1="310" y1="110" x2="310" y2="190" />
      <circle className="cost__dot" cx="310" cy="110" r="4" />
      <text className="cost__tag" x="300" y="76" textAnchor="end">
        이 지점을 넘으면 인덱스를 버리고 전부 읽는 쪽이 싸다
      </text>
    </svg>
  );
}

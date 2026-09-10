import { Block, Figure, Note, Roles } from './parts';

/** How the pages from the previous chapter get wired into a tree, and what a lookup costs. */
export function IndexChapter() {
  return (
    <>
      <p className="doc-lead">
        페이지 하나로는 테이블이 안 된다. 페이지들은 <strong>B+tree</strong> 로 엮인다. 값은 전부
        리프 페이지에만 있고, 위쪽 페이지들은 “이 값 이상은 저쪽 페이지로” 라는 이정표만 담는다.
        페이지 한 장에 이정표를 수백 개 넣을 수 있어서, 높이 3~4 면 수천만 행도 덮는다.
      </p>

      <Figure caption="같은 테이블의 두 인덱스. 왼쪽 리프에는 행 전체가, 오른쪽 리프에는 인덱스 키와 PK 만 있다.">
        <IndexPairDiagram />
      </Figure>

      <Block title="두 인덱스가 다른 점">
        <Roles
          rows={[
            [
              '클러스터드 인덱스',
              <>
                PK 로 정렬된 트리이고, <b>리프 페이지가 곧 테이블</b>이다. 행 데이터가 여기 말고 따로
                있는 곳은 없다. PK 로 찾으면 리프에 닿는 순간 끝난다.
              </>,
            ],
            [
              '세컨더리 인덱스',
              <>
                인덱스 키로 정렬된 별도의 트리. 리프에는 <b>키 + PK 값</b>만 있다. 나머지 컬럼이
                필요하면 그 PK 로 클러스터드 인덱스를 한 번 더 탄다(리프 오프).
              </>,
            ],
            [
              '커버링 인덱스',
              <>
                필요한 컬럼이 인덱스 안에 다 있으면 두 번째 탐색을 건너뛴다.{' '}
                <code>SELECT id FROM users WHERE email = ?</code> 가 그런 경우다.
              </>,
            ],
          ]}
        />
      </Block>

      <Block title="한 번 찾는 데 드는 일">
        <ol className="doc-steps">
          <li>
            <b>루트 페이지</b> — 인덱스마다 루트 페이지 번호는 고정이라 바로 찾아간다. 버퍼 풀에 거의
            항상 올라와 있다.
          </li>
          <li>
            <b>페이지 안 탐색</b> — 디렉터리 슬롯으로 이진 탐색한 뒤 링크를 몇 칸 따라가, 내려갈 자식
            페이지 번호를 얻는다.
          </li>
          <li>
            <b>한 층 내려가기</b> — 그 페이지가 버퍼 풀에 없으면 디스크에서 읽는다. 리프에 닿을 때까지
            반복한다.
          </li>
          <li>
            <b>옆으로</b> — 범위 조회는 리프끼리 양방향으로 이어져 있어, 트리를 다시 타지 않고 옆
            페이지로 이어 읽는다.
          </li>
        </ol>
        <p>
          그래서 인덱스가 있으면 읽기가 빨라지지만, 쓰기는 인덱스 수만큼 늘어난다. 인덱스 하나하나가
          같은 데이터를 다른 순서로 정렬해 둔 사본이고, INSERT 는 그 사본 전부에 자리를 만들어야 한다.
        </p>
        <Note>
          이 시뮬레이터는 페이지당 레코드를 3~8개로 줄여 트리 높이가 금방 자란다. 실제 fanout 은 훨씬
          커서 같은 행 수라도 높이가 이만큼 되지 않는다. B+tree 탭에서 두 인덱스를 나란히 볼 수 있다.
        </Note>
      </Block>
    </>
  );
}

function IndexPairDiagram() {
  return (
    <svg className="pairmap" viewBox="0 0 570 250" role="img" aria-label="클러스터드 인덱스와 세컨더리 인덱스">
      <defs>
        <marker id="doc-pair-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill="var(--secondary-accent)" />
        </marker>
      </defs>

      <text className="pairmap__title" x="10" y="14">
        클러스터드 인덱스 — PRIMARY KEY (id)
      </text>
      <text className="pairmap__title pairmap__title--secondary" x="310" y="14">
        세컨더리 인덱스 — KEY idx_email (email)
      </text>

      <path className="pairmap__edge" d="M135 60 L67 110" />
      <path className="pairmap__edge" d="M135 60 L202 110" />
      <path className="pairmap__edge" d="M435 60 L367 110" />
      <path className="pairmap__edge" d="M435 60 L502 110" />

      <g>
        <rect className="pairmap__node" x="75" y="30" width="120" height="30" rx="5" />
        <text className="pairmap__text" x="135" y="50" textAnchor="middle">
          10 · 30
        </text>
      </g>
      <g>
        <rect className="pairmap__node pairmap__node--secondary" x="375" y="30" width="120" height="30" rx="5" />
        <text className="pairmap__text" x="435" y="50" textAnchor="middle">
          a@x · c@x
        </text>
      </g>

      <rect className="pairmap__leaf" x="10" y="110" width="115" height="54" rx="5" />
      <text className="pairmap__text" x="67" y="131" textAnchor="middle">
        10 · a · a@x
      </text>
      <text className="pairmap__text" x="67" y="151" textAnchor="middle">
        20 · b · b@x
      </text>

      <rect className="pairmap__leaf" x="145" y="110" width="115" height="54" rx="5" />
      <text className="pairmap__text" x="202" y="131" textAnchor="middle">
        30 · c · c@x
      </text>

      <rect className="pairmap__leaf pairmap__leaf--secondary" x="310" y="110" width="115" height="54" rx="5" />
      <text className="pairmap__text" x="367" y="131" textAnchor="middle">
        a@x → 10
      </text>
      <text className="pairmap__text" x="367" y="151" textAnchor="middle">
        b@x → 20
      </text>

      <rect className="pairmap__leaf pairmap__leaf--secondary" x="445" y="110" width="115" height="54" rx="5" />
      <text className="pairmap__text" x="502" y="131" textAnchor="middle">
        c@x → 30
      </text>

      <path className="pairmap__sibling" d="M125 137 L145 137" />
      <path className="pairmap__sibling" d="M425 137 L445 137" />
      <text className="pairmap__hint" x="135" y="182" textAnchor="middle">
        리프끼리 양방향 링크 — 범위 스캔
      </text>

      <path
        className="pairmap__lookup"
        d="M367 164 C 367 215, 67 215, 67 168"
        markerEnd="url(#doc-pair-arrow)"
      />
      <text className="pairmap__hint pairmap__hint--secondary" x="290" y="240" textAnchor="middle">
        나머지 컬럼이 필요하면 PK 로 클러스터드 인덱스를 한 번 더 — 리프 오프
      </text>
    </svg>
  );
}

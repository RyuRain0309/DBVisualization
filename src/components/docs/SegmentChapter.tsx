import { Block, Figure, Note, Sub } from './parts';

const FRAGMENT_LIMIT = 32;
const PAGES_IN_EXTENT = 64;

/**
 * Where the two units that sound alike get separated: the extent is how space is handed out,
 * the segment is who holds it. The allocation rule that connects them is the point of the chapter.
 */
export function SegmentChapter() {
  return (
    <>
      <p className="doc-lead">
        이름이 비슷해 헷갈리지만 나란한 단위가 아니다. <strong>익스텐트</strong>는 공간을 떼어 주는{' '}
        <strong>할당 단위</strong>이고, <strong>세그먼트</strong>는 그렇게 받은 공간을 용도별로 묶은{' '}
        <strong>소유 단위</strong>다.
      </p>

      <Block title="익스텐트 — 공간을 나누는 격자">
        <p>
          <code>.ibd</code> 는 처음부터 끝까지 연속된 {PAGES_IN_EXTENT}장(1MB) 단위로 잘려 있다. 이 칸
          하나가 익스텐트이고, 크기는 고정이다. 어느 페이지든 어떤 익스텐트 안에 들어 있다.
        </p>
        <p>
          공간을 이 단위로 배분하는 이유는 <b>연속성</b>이다. 한 장씩 나눠 주면 페이지가 파일 곳곳에
          흩어져, 범위 스캔이 디스크 위를 왔다 갔다 하게 된다. 익스텐트를 통째로 주면 그 안에 채워지는
          페이지들이 붙어 있다.
        </p>
      </Block>

      <Block title="세그먼트 — 같은 용도끼리 묶는 단위">
        <p>
          세그먼트는 크기가 정해져 있지 않고, 연속일 필요도 없다. 그냥 <b>“이 용도로 쓰는 페이지들”</b>
          의 목록이다.
        </p>
        <p>
          인덱스 하나가 세그먼트를 <b>두 개</b> 갖는다 — 행이 든 <b>리프 세그먼트</b>와, 이정표가 든{' '}
          <b>논리프 세그먼트</b>. 둘을 갈라 두면 리프 페이지끼리 디스크에서 모여 있게 되어, 범위 스캔이
          파일을 순서대로 훑을 수 있다. 섞여 있으면 행을 읽다 이정표를 건너뛰기를 반복해야 한다.
        </p>
        <Figure caption="users 테이블에 PK 와 idx_email 이 있으면 세그먼트는 넷이다.">
          <ul className="segs">
            <li>
              <b>PRIMARY</b>
              <span>리프 세그먼트 — 행 전체가 든 페이지</span>
            </li>
            <li>
              <b>PRIMARY</b>
              <span>논리프 세그먼트 — 내려갈 자식을 가리키는 페이지</span>
            </li>
            <li>
              <b>idx_email</b>
              <span>리프 세그먼트 — email + PK 가 든 페이지</span>
            </li>
            <li>
              <b>idx_email</b>
              <span>논리프 세그먼트</span>
            </li>
          </ul>
        </Figure>
      </Block>

      <Block title="세그먼트가 공간을 받아오는 방식">
        <p>크기에 따라 한 번 바뀐다.</p>
        <ol className="doc-steps">
          <li>
            <b>처음 {FRAGMENT_LIMIT}장 — 조각 페이지</b> — 익스텐트를 통째로 받지 않고, 비어 있는
            자리에서 한 장씩 빌려 온다. 그 자리는 여러 세그먼트가 함께 쓰는 익스텐트라 페이지들이
            흩어진다.
          </li>
          <li>
            <b>{FRAGMENT_LIMIT + 1}장째부터 — 전용 익스텐트</b> — 1MB 를 통째로 선점하고 그 안을 채워
            간다. 다 차면 다음 익스텐트를 잡는다. 이 자리는 그 세그먼트 전용이라 페이지가 연속으로
            붙는다.
          </li>
        </ol>

        <Figure caption="100장짜리 세그먼트의 구성. 앞서 받은 조각 페이지를 나중에 익스텐트로 옮겨 모으지는 않는다.">
          <div className="grow">
            <div className="grow__row">
              <span className="grow__label">조각 페이지</span>
              <span className="grow__bar grow__bar--frag">32장 · 흩어져 있음</span>
            </div>
            <div className="grow__row">
              <span className="grow__label">익스텐트 A</span>
              <span className="grow__bar grow__bar--extent">64장 · 연속</span>
            </div>
            <div className="grow__row">
              <span className="grow__label">익스텐트 B</span>
              <span className="grow__bar grow__bar--extent grow__bar--partial">
                4장 사용 · 나머지는 이 세그먼트 몫으로 비워 둠
              </span>
            </div>
          </div>
        </Figure>

        <Sub title="왜 처음부터 익스텐트로 주지 않나">
          <p>
            그러면 행 몇 개짜리 테이블도 만들자마자 1MB 를 문다. 인덱스 하나가 세그먼트를 둘씩 쓰므로
            테이블 하나에 몇 MB 이고, 작은 테이블이 수천 개면 낭비가 크다.
          </p>
          <p>
            반대로 계속 한 장씩만 주면 페이지가 흩어져 범위 스캔이 느려진다. 그래서{' '}
            <b>작을 때는 공간을 아끼고, 커지면 연속성을 택하는</b> 절충이다. {FRAGMENT_LIMIT}장
            (512KB)을 넘겼다면 어차피 계속 자랄 테이블이라 1MB 를 잡아도 아깝지 않다.
          </p>
        </Sub>

        <Sub title="조각 페이지와 전용 익스텐트의 차이">
          <ul className="doc-steps">
            <li>
              <b>확보 시점</b> — 조각은 필요할 때 한 장씩, 익스텐트는 쓰기 전에 {PAGES_IN_EXTENT}장
              분량을 미리.
            </li>
            <li>
              <b>위치</b> — 조각은 그때 비어 있던 자리라 예측할 수 없고, 익스텐트 안은 연속이 보장된다.
            </li>
            <li>
              <b>남는 공간</b> — 조각은 딱 쓸 만큼만 받아 낭비가 없고, 익스텐트는 다 못 채우면 그만큼
              비워 둔 채로 둔다.
            </li>
          </ul>
          <p>
            읽을 때는 구분이 없다. 둘 다 그 세그먼트의 페이지이고, 차이는 디스크에서 붙어 있느냐뿐이다.
          </p>
        </Sub>

        <Note>
          이 시뮬레이터는 세그먼트와 익스텐트를 모델링하지 않는다. 페이지에 번호만 붙여 관리하므로,
          B+tree 탭에서 보이는 페이지 번호는 파일 안의 실제 위치가 아니다.
        </Note>
      </Block>
    </>
  );
}

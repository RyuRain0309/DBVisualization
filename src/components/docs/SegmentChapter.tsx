import { Block, DocLink, Figure, Note, Roles, Sub, Var } from "./parts";

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
        <strong>익스텐트</strong>는 공간을 떼어 주는 <strong>할당 단위</strong>
        이고, <strong>세그먼트</strong>는 그렇게 받은 공간을 용도별로 묶은{" "}
        <strong>소유 단위</strong>다.
      </p>

      <Block title="익스텐트 — 공간을 나누는 격자">
        <p>
          <code>.ibd</code> 는 처음부터 끝까지 연속된 {PAGES_IN_EXTENT}장(1MB)
          단위로 잘려 있다. 이 칸 하나가 익스텐트이고, 크기는 고정이다. 어느
          페이지든 어떤 익스텐트 안에 들어 있다.
        </p>
        <p>
          공간을 이 단위로 배분하는 이유는 <b>연속성</b>이다. 한 장씩 나눠 주면
          페이지가 파일 곳곳에 흩어져, 범위 스캔이 디스크 위를 왔다 갔다 하게
          된다. 익스텐트를 통째로 주면 그 안에 채워지는 페이지들이 붙어 있다.
        </p>
        <p>
          미리 읽기(linear read-ahead)도 이 단위로 동작한다. 한 익스텐트의
          페이지를 순서대로 <Var name="innodb_read_ahead_threshold" />장 이상
          읽으면, InnoDB 는 다음 익스텐트 {PAGES_IN_EXTENT}장을 요청이 오기 전에
          통째로 읽어 둔다. 페이지가 익스텐트 안에 순서대로 붙어 있어야 이
          동작이 효과가 있다.
        </p>

        <Sub title="익스텐트의 상태">
          <p>
            익스텐트마다 XDES entry 가 하나씩 있고, 거기에 <b>익스텐드 상태</b>,{" "}
            <b>주인 세그먼트 번호</b>, <b>포함된 각 페이지의 상태</b>가 기록되어
            있다. 상태는 넷 중 하나다.
          </p>
          <Roles
            rows={[
              ["FREE", <>아무도 쓰지 않는 빈 익스텐트. 주인이 없다.</>],
              [
                "FREE_FRAG",
                <>
                  여러 세그먼트가 한 장씩 나눠 쓰는 익스텐트. 빈 페이지가 남아
                  있다. 주인이 없다.
                </>,
              ],
              [
                "FULL_FRAG",
                <>
                  나눠 쓰는 익스텐트인데 {PAGES_IN_EXTENT}장이 모두 나가 빈
                  페이지가 없다. 주인이 없다.
                </>,
              ],
              [
                "FSEG",
                <>
                  세그먼트 하나가 통째로 가져간 익스텐트. 주인 세그먼트 번호가
                  적혀 있다.
                </>,
              ],
            ]}
          />
          <p>
            익스텐트는 항상 목록 하나에 들어 있다. 주인이 없는 세 상태는 FSP_HDR
            의 <b>FREE</b> · <b>FREE_FRAG</b> · <b>FULL_FRAG</b> 목록에
            들어가고, <b>FSEG</b> 상태는 주인 세그먼트의 INODE entry 에 있는{" "}
            <b>FREE</b> · <b>NOT_FULL</b> · <b>FULL</b> 목록에 들어간다.
          </p>
          <p className="note">
            <b>참고</b> — 이름이 같은 FREE 목록이 두 곳에 있다. FSP_HDR 의 FREE
            는 아무도 가져가지 않은 익스텐트이고, INODE entry 의 FREE 는
            세그먼트가 가져갔지만 아직 한 장도 쓰지 않은 익스텐트다.
          </p>
        </Sub>
      </Block>

      <Block title="세그먼트 — 같은 용도끼리 묶는 단위">
        <p>
          세그먼트는 크기가 정해져 있지 않고, 연속일 필요도 없다. 한 인덱스의
          리프처럼 <b>같은 용도</b>로 쓰이는 조각 페이지와 익스텐트를 모아 놓은
          논리적 단위이다.
        </p>
        <p>
          세그먼트는 <b>INODE entry</b>(192 byte)를 같는다. 거기에는 세그먼트
          번호, 낱장으로 가진 페이지의 번호를 기록해 두는{" "}
          <code>FSEG_FRAG_ARR</code>, 보유한 익스텐트 <b>FREE</b> ·{" "}
          <b>NOT_FULL</b> · <b>FULL</b> 리스트에 대한 정보 등이 있다. 이 entry를
          통해 세그먼트가 보유한 낱장 페이지, 익스텐드 위치를 알 수 있다.
        </p>
        <p>
          인덱스 하나는 세그먼트를 <b>두 개</b> 갖는다 — 레코드가 든{" "}
          <b>리프 세그먼트</b>와, 이정표가 든 <b>논리프 세그먼트</b>. 둘을 나눠
          두면 리프 페이지끼리 디스크에서 모여 있게 되어, 범위 스캔이 파일을
          순서대로 훑기에 유리하다.
        </p>
        <Figure>
          <ul className="segs">
            <li>
              <b>
                <code>PRIMARY</code>
              </b>
              <span>리프 세그먼트 — 행 전체가 든 페이지</span>
            </li>
            <li>
              <b>
                <code>PRIMARY</code>
              </b>
              <span>논리프 세그먼트 — 내려갈 자식을 가리키는 페이지</span>
            </li>
            <li>
              <b>세컨더리 인덱스</b>
              <span>리프 세그먼트 — 인덱스 컬럼 + PK 가 든 페이지</span>
            </li>
            <li>
              <b>세컨더리 인덱스</b>
              <span>논리프 세그먼트</span>
            </li>
          </ul>
        </Figure>
      </Block>

      <Block title="세그먼트가 공간을 받아오는 방식">
        <p>
          B+tree 는 페이지가 꽉 차 분할할 때 새 페이지가 한 장 필요하다. 이
          페이지는 그 B+tree 의 세그먼트, 곧 INODE entry 에 요청해야 하므로
          INODE entry 가 어디 있는지 알아야 한다. 그 위치는 B+tree 의{" "}
          <b>루트 페이지</b> 헤더에 두 개 적혀 있다.
        </p>
        <ul className="doc-steps">
          <li>
            <b>PAGE_BTR_SEG_LEAF</b> — 리프 세그먼트의 INODE entry 위치
          </li>
          <li>
            <b>PAGE_BTR_SEG_TOP</b> — 논리프 세그먼트의 INODE entry 위치
          </li>
        </ul>
        <p>
          위치 하나는 10 byte 로, 어느 테이블스페이스인지(스페이스 ID 4 byte),
          그 안의 몇 번 페이지인지(페이지 번호 4 byte), 그 페이지 안의 몇 번째
          byte 인지(오프셋 2 byte)를 적는다.
        </p>
        <p>
          새 리프 페이지가 필요하면 PAGE_BTR_SEG_LEAF 를, 논리프 페이지가
          필요하면 PAGE_BTR_SEG_TOP 을 읽어 그 INODE entry 로 간다.
        </p>

        <p>
          INODE entry 에서 페이지를 받는 방식은 세그먼트의 크기에 따라 한 번
          바뀐다. 세그먼트에 작다 · 크다를 적어 둔 값은 없고, 페이지를 받을
          때마다 INODE entry 의 <code>FSEG_FRAG_ARR</code> {FRAGMENT_LIMIT}칸에
          빈 칸이 남았는지 보고 정한다.
        </p>
        <ol className="doc-steps">
          <li>
            <b>처음 {FRAGMENT_LIMIT}장 — 조각 페이지</b> — 익스텐트를 통째로
            받지 않고, <b>FREE_FRAG</b> 익스텐트에서 한 장씩 빌려 온다. 받은
            페이지의 번호는 <code>FSEG_FRAG_ARR</code> 의 빈 칸에 적는다. 그
            익스텐트는 여러 세그먼트가 함께 쓰므로 페이지들이 흩어진다.
          </li>
          <li>
            <b>{FRAGMENT_LIMIT + 1}장째부터 — 전용 익스텐트</b> — 1MB 를 통째로
            선점하고 그 안을 채워 간다. 다 차면 다음 익스텐트를 잡는다. 선점은
            XDES entry 에 주인 세그먼트 번호를 적고 상태를 <b>FSEG</b> 로 바꾼
            뒤, 세그먼트의 목록에 넣는 것이다. 이 자리는 그 세그먼트 전용이라
            페이지가 연속으로 붙는다.
          </li>
        </ol>
        <p>
          요청 한 번이 어떤 순서로 처리되는지는 앞 장{" "}
          <DocLink chapter="tablespace" anchor="page-alloc">
            「테이블스페이스 내부 구조」의 페이지 할당 순서도
          </DocLink>
          에 있다.
        </p>

        <Figure caption="100장짜리 세그먼트의 구성. 앞서 받은 조각 페이지를 나중에 익스텐트로 옮겨 모으지는 않는다.">
          <div className="grow">
            <div className="grow__row">
              <span className="grow__label">조각 페이지</span>
              <span className="grow__bar grow__bar--frag">
                32장 · 흩어져 있음
              </span>
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
            그러면 행 몇 개짜리 테이블도 만들자마자 1MB 를 문다. 인덱스 하나가
            세그먼트를 둘씩 쓰므로 테이블 하나에 몇 MB 이고, 작은 테이블이 수천
            개면 낭비가 크다.
          </p>
          <p>
            반대로 계속 한 장씩만 주면 페이지가 흩어져 범위 스캔이 느려진다.
            그래서 <b>작을 때는 공간을 아끼고, 커지면 연속성을 택하는</b>{" "}
            절충이다. {FRAGMENT_LIMIT}장 (512KB)을 넘겼다면 어차피 계속 자랄
            테이블이라 1MB 를 잡아도 아깝지 않다.
          </p>
        </Sub>
      </Block>

      <Block title="세그먼트가 공간을 돌려주는 방식">
        <p>
          행을 지워 페이지가 비거나 옆 페이지와 병합되면 B+tree 는 그 페이지를
          세그먼트에 돌려준다. 그 페이지를 어떻게 받았느냐에 따라 처리가 다르다.
        </p>
        <Sub title="전용 익스텐트의 페이지">
          <ol className="doc-steps">
            <li>
              <b>페이지 비트</b> — XDES entry 의 페이지 비트에 빈 페이지로
              표시한다.
            </li>
            <li>
              <b>목록 이동</b> — 그 익스텐트가 <b>FULL</b> 목록에 있었다면{" "}
              <b>NOT_FULL</b> 목록으로 옮긴다. 익스텐트는 여전히 이 세그먼트
              것이고, 다음에 페이지를 받을 때 이 빈 페이지를 다시 쓴다.
            </li>
            <li>
              <b>익스텐트 반납</b> — {PAGES_IN_EXTENT}장이 모두 비면 세그먼트의
              목록에서 빼고 주인 세그먼트 번호를 지운 뒤 FSP_HDR 의 <b>FREE</b>{" "}
              목록에 넣는다. 이제 같은 파일의 다른 세그먼트도 이 익스텐트를
              가져갈 수 있다.
            </li>
          </ol>
        </Sub>
        <Sub title="조각 페이지">
          <ol className="doc-steps">
            <li>
              <b>FSEG_FRAG_ARR</b> — 그 페이지 번호가 적힌 칸을 빈 칸(
              <code>FIL_NULL</code>)으로 되돌린다.
            </li>
            <li>
              <b>페이지 비트</b> — XDES entry 의 페이지 비트에 빈 페이지로
              표시한다. 그 익스텐트가 <b>FULL_FRAG</b> 였다면 <b>FREE_FRAG</b>{" "}
              목록으로 옮긴다.
            </li>
            <li>
              <b>익스텐트 반납</b> — 나눠 쓰던 세그먼트들이 모두 돌려줘{" "}
              {PAGES_IN_EXTENT}장이 다 비면 <b>FREE</b> 목록으로 옮긴다.
            </li>
          </ol>
        </Sub>
        <p>
          어느 경우든 공간은 파일 안의 목록으로 돌아갈 뿐 OS 로 돌아가지 않는다.
          그래서 행을 지워도 <code>.ibd</code> 크기는 줄지 않는다. 인덱스를
          지우면(<code>DROP INDEX</code>) 그 인덱스의 두 세그먼트가 가진
          익스텐트와 조각 페이지를 전부 이렇게 돌려준 뒤 INODE entry 도 비운다.
        </p>

        <Note>
          이 시뮬레이터는 세그먼트와 익스텐트를 모델링하지 않는다. 페이지에
          번호만 붙여 관리하므로, B+tree 탭에서 보이는 페이지 번호는 파일 안의
          실제 위치가 아니다.
        </Note>
      </Block>
    </>
  );
}

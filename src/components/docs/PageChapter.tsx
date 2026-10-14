import { Fragment, useState } from "react";
import { Block, DocLink, Figure, Note, Sub } from "./parts";

interface Zone {
  id: string;
  name: string;
  size: string;
  role: string;
  /** Rough share of the 16KB page, so the drawing reads like a page and not a list. */
  grow: number;
  tone: "head" | "bound" | "rows" | "free" | "dir";
  arrow?: string;
}

const ZONES: Zone[] = [
  {
    id: "file-header",
    name: "File Header",
    size: "38B",
    role: "페이지 번호와 종류, 체크섬, 마지막으로 바뀐 LSN, 그리고 같은 레벨의 앞·뒤 페이지 번호",
    grow: 0,
    tone: "head",
  },
  {
    id: "page-header",
    name: "Page Header",
    size: "56B",
    role: "레코드 수, 슬롯 수, 빈 공간이 시작되는 위치, 삭제된 레코드 목록, 이 페이지의 트리 레벨",
    grow: 0,
    tone: "head",
  },
  {
    id: "bounds",
    name: "Infimum · Supremum",
    size: "26B",
    role: "페이지의 논리적 양 끝. 실제 데이터는 없지만 링크의 시작과 끝이고, 갭 락이 걸리는 자리이기도 하다",
    grow: 0,
    tone: "bound",
  },
  {
    id: "records",
    name: "User Records",
    size: "가변",
    role: "실제 행(리프) 또는 자식 페이지로 가는 이정표(논리프). 삽입된 순서대로 위에서 아래로 쌓인다",
    grow: 3,
    tone: "rows",
    arrow: "▼ 삽입될수록 아래로",
  },
  {
    id: "free",
    name: "Free Space",
    size: "가변",
    role: "아직 쓰지 않은 공간. 레코드가 위에서, 디렉터리가 아래에서 갉아먹어 가운데가 줄어든다",
    grow: 2,
    tone: "free",
  },
  {
    id: "directory",
    name: "Page Directory",
    size: "가변",
    role: "레코드 4~8개마다 슬롯 하나. 페이지 끝에서부터 거꾸로 자란다",
    grow: 0.6,
    tone: "dir",
    arrow: "▲ 늘어날수록 위로",
  },
  {
    id: "trailer",
    name: "File Trailer",
    size: "8B",
    role: "체크섬과 LSN 하위 4 byte. 헤더 값과 맞지 않으면 쓰다 만 페이지라는 뜻이다",
    grow: 0,
    tone: "head",
  },
];

/** One field of a fixed layout: identifier, size in bytes, what it holds, and what reads it. */
type Field = [name: string, bytes: number | string, note: string, use?: string];

const FILE_HEADER: Field[] = [
  [
    "FIL_PAGE_SPACE_OR_CHKSUM",
    4,
    "체크섬. 페이지 내용으로 계산한 값",
    "디스크에서 읽은 직후 내용으로 다시 계산해 비교한다. 다르면 손상된 페이지로 보고 Doublewrite Buffer 의 사본을 찾는다",
  ],
  [
    "FIL_PAGE_OFFSET",
    4,
    "페이지 번호. 이 파일 안에서 몇 번째 페이지인지",
    "읽어 온 페이지가 요청한 페이지가 맞는지 확인한다. Doublewrite Buffer 의 사본을 어느 자리로 되돌릴지도 이 값으로 안다",
  ],
  [
    "FIL_PAGE_PREV",
    4,
    "같은 레벨의 앞 페이지 번호. 없으면 FIL_NULL",
    "역방향 범위 스캔(ORDER BY … DESC)이 앞 리프로 넘어갈 때 읽는다. 분할 · 병합 때 이웃 페이지의 값을 함께 고친다",
  ],
  [
    "FIL_PAGE_NEXT",
    4,
    "같은 레벨의 뒤 페이지 번호. 없으면 FIL_NULL",
    "범위 스캔이 리프 하나를 다 읽고 다음 리프로 넘어갈 때 읽는다",
  ],
  [
    "FIL_PAGE_LSN",
    8,
    "이 페이지를 마지막으로 바꾼 리두 로그의 위치(LSN)",
    "크래시 복구에서 리두 로그 레코드의 LSN 이 이 값보다 크지 않으면 이미 반영된 변경이므로 건너뛴다. 페이지를 디스크에 쓰기 전에는 리두 로그가 이 LSN 까지 먼저 디스크에 쓰였는지 확인한다",
  ],
  [
    "FIL_PAGE_TYPE",
    2,
    "페이지 종류. 인덱스 페이지는 FIL_PAGE_INDEX, 그 밖에 FSP_HDR · INODE · UNDO 등",
    "File Header 뒤의 내용을 어떤 구조로 읽을지 정한다",
  ],
  ["FIL_PAGE_FILE_FLUSH_LSN", 8, "일반 인덱스 페이지에서는 쓰지 않는다"],
  [
    "FIL_PAGE_SPACE_ID",
    4,
    "스페이스 ID. 이 페이지가 속한 테이블스페이스 번호",
    "페이지 번호와 함께, 읽어 온 페이지가 요청한 것인지 확인하고 Doublewrite Buffer 의 사본이 어느 파일 것인지 구분한다",
  ],
];

const PAGE_HEADER: Field[] = [
  [
    "PAGE_N_DIR_SLOTS",
    2,
    "Page Directory 의 슬롯 수",
    "페이지 안에서 키를 찾을 때 이진 탐색의 범위가 된다",
  ],
  [
    "PAGE_HEAP_TOP",
    2,
    "Free Space 가 시작되는 위치",
    "새 레코드를 쓸 자리다. 남은 Free Space 크기도 이 값으로 계산한다",
  ],
  [
    "PAGE_N_HEAP",
    2,
    "지금까지 자리를 받은 레코드 수. infimum · supremum 과 삭제된 레코드도 센다",
    "새 레코드에 붙일 힙 번호(heap_no)를 정한다. 레코드 락은 이 힙 번호로 어느 레코드에 걸렸는지 표시한다",
  ],
  [
    "PAGE_FREE",
    2,
    "삭제된 레코드 목록의 첫 레코드 위치",
    "삽입할 때 재사용할 자리가 있는지 먼저 여기를 본다",
  ],
  [
    "PAGE_GARBAGE",
    2,
    "삭제된 레코드들이 차지한 byte 수",
    "Free Space 가 모자랄 때 재구성하면 들어갈지 판단한다. 병합 여부를 정할 때 실제 사용량 계산에도 쓴다",
  ],
  [
    "PAGE_LAST_INSERT",
    2,
    "마지막으로 넣은 레코드의 위치",
    "새 레코드가 바로 그 뒤에 들어가는지 보고 순차 삽입인지 판단한다",
  ],
  [
    "PAGE_DIRECTION",
    2,
    "최근 삽입이 이어진 방향. 오른쪽 · 왼쪽 · 없음",
    "분할할 때 가운데서 나눌지, 삽입 지점에서 나눌지 정한다",
  ],
  [
    "PAGE_N_DIRECTION",
    2,
    "같은 방향으로 연속해서 들어온 횟수",
    "PAGE_DIRECTION 과 함께 분할 지점을 정한다",
  ],
  [
    "PAGE_N_RECS",
    2,
    "살아 있는 사용자 레코드 수",
    "페이지가 비었는지, 병합할지 판단한다. 옵티마이저 통계가 행 수를 추정할 때도 읽는다",
  ],
  [
    "PAGE_MAX_TRX_ID",
    8,
    "이 페이지를 바꾼 가장 큰 트랜잭션 ID. 세컨더리 인덱스 리프에서만 쓴다",
    "세컨더리 인덱스 레코드에는 트랜잭션 ID 가 없다. 이 값이 내 read view 보다 오래됐으면 페이지의 모든 레코드가 보이는 것이므로 클러스터 인덱스를 확인하지 않는다",
  ],
  [
    "PAGE_LEVEL",
    2,
    "트리에서의 높이. 리프가 0",
    "탐색이 리프에 도착했는지 안다. 새 페이지를 요청할 때 리프 · 논리프 세그먼트 중 어느 쪽에 요청할지도 정한다",
  ],
  [
    "PAGE_INDEX_ID",
    8,
    "이 페이지가 속한 인덱스의 ID",
    "읽은 페이지가 찾던 인덱스의 것이 맞는지 확인한다",
  ],
  [
    "PAGE_BTR_SEG_LEAF",
    10,
    "리프 세그먼트의 INODE entry 위치. 루트 페이지에만 값이 있다",
    "리프 페이지를 새로 받거나 돌려줄 때 INODE entry 를 찾아간다",
  ],
  [
    "PAGE_BTR_SEG_TOP",
    10,
    "논리프 세그먼트의 INODE entry 위치. 루트 페이지에만 값이 있다",
    "논리프 페이지를 새로 받거나 돌려줄 때 INODE entry 를 찾아간다",
  ],
];

const BOUNDS: Field[] = [
  [
    "infimum 의 레코드 헤더",
    5,
    "일반 레코드와 같은 5 byte 헤더. next_record 가 가장 작은 키의 레코드를 가리킨다",
    "페이지 안의 레코드를 키 순서로 훑을 때 출발점이다",
  ],
  ["infimum 의 본문", 8, '글자 "infimum" + 0(1byte)'],
  [
    "supremum 의 레코드 헤더",
    5,
    "next_record 가 0 이다. 링크의 끝이라는 뜻",
    "훑기가 여기 닿으면 이 페이지는 끝이고 FIL_PAGE_NEXT 로 넘어간다. 마지막 레코드 뒤의 갭에 거는 락도 이 레코드에 건다",
  ],
  ["supremum 의 본문", 8, '글자 "supremum"'],
];

const TRAILER: Field[] = [
  [
    "체크섬",
    4,
    "File Header 의 체크섬과 짝이 되는 값",
    "페이지를 읽을 때 헤더의 체크섬과 함께 확인한다",
  ],
  [
    "LSN 하위 4 byte",
    4,
    "File Header 의 FIL_PAGE_LSN 뒤쪽 4 byte 와 같아야 한다",
    "헤더와 다르면 페이지의 앞과 뒤가 서로 다른 시점의 내용이다. 쓰다 만 페이지로 본다",
  ],
];

/** What is inside one 16KB page, and why a page is not just a sorted array of rows. */
export function PageChapter() {
  return (
    <>
      <p className="doc-lead">
        페이지 한 장은 16KB 짜리 작은 파일 같다. 앞뒤로 자기 자신을 설명하는
        머리말과 꼬리말이 붙고, 가운데에 행이 들어간다. 중요한 건{" "}
        <strong>행이 키 순서대로 놓여 있지 않다</strong>는 점이다. 순서는 자리
        배치가 아니라 링크가 만든다.
      </p>

      <Figure caption="한 페이지의 위에서 아래까지. 헤더와 트레일러는 크기가 고정이고, 가운데 빈 공간을 레코드와 디렉터리가 양쪽에서 갉아먹는다.">
        <PageMap />
      </Figure>

      <Block title="영역별 구조">
        <p>
          일곱 영역 가운데 File Header · Page Header · Infimum · Supremum · File
          Trailer 는 필드와 크기가 정해져 있다. User Records · Free Space · Page
          Directory 는 레코드가 늘고 줄 때마다 크기가 바뀐다.
        </p>

        <Sub title="File Header">
          <p>
            인덱스 페이지뿐 아니라 FSP_HDR · INODE · 언두 페이지까지{" "}
            <b>모든 종류의 페이지</b>가 맨 앞에 똑같이 갖는 38 byte 다. 이
            페이지가 어느 파일의 몇 번째 페이지이고 어떤 종류인지를 적는다.
          </p>
          <Figure>
            <Fields title="File Header" size="38 byte" rows={FILE_HEADER} />
          </Figure>
        </Sub>

        <Sub title="Page Header">
          <p>
            인덱스 페이지에만 있는 56 byte 다. 앞 36 byte 는 이 페이지 안의
            레코드 상태를 적고, 뒤 20 byte 는 세그먼트 위치 두 개다.
          </p>
          <Figure>
            <Fields title="Page Header" size="56 byte" rows={PAGE_HEADER} />
          </Figure>
          <p>
            <code>PAGE_LAST_INSERT</code> · <code>PAGE_DIRECTION</code> ·{" "}
            <code>PAGE_N_DIRECTION</code> 은 삽입이 한 방향으로 이어지는지
            알아내는 데 쓴다. 이어지고 있으면 분할할 때 절반으로 나누지 않는다.
            뒤 20 byte 의 쓰임은{" "}
            <DocLink chapter="segment">「세그먼트 · 익스텐트 구조」</DocLink>{" "}
            장에 있다.
          </p>
        </Sub>

        <Sub title="Infimum · Supremum">
          <p>
            페이지를 만들 때 함께 만들어지는 레코드 두 개다. 사용자 데이터는
            없고, infimum 은 이 페이지의 어떤 키보다도 작은 레코드, supremum 은
            어떤 키보다도 큰 레코드로 취급한다. 위치가 고정이라 (Page Header
            바로 뒤) 페이지가 비어 있어도 링크의 시작과 끝이 항상 있다.
          </p>
          <Figure>
            <Fields title="Infimum · Supremum" size="26 byte" rows={BOUNDS} />
          </Figure>
        </Sub>

        <Sub title="User Records">
          <p>
            레코드 하나는 <b>레코드 헤더 + 컬럼 값</b>이다. 헤더 안의{" "}
            <code>next_record</code> 2 byte 에 다음 레코드까지의 거리가 적혀
            있어, 자리는 들어온 순서여도 링크는 키 순서로 이어진다. 헤더의
            나머지 필드와 컬럼 배치는{" "}
            <DocLink chapter="record">「레코드 내부 구조」</DocLink> 장에서
            다룬다.
          </p>
          <p>
            레코드를 지우면 그 자리는 이렇게 처리된다. 단계별 그림은 아래{" "}
            <DocLink chapter="page" anchor="record-insert-delete">
              「레코드 삽입과 삭제」
            </DocLink>
            에 있다.
          </p>
          <ol className="doc-steps">
            <li>
              <b>삭제 표시</b> — 레코드 헤더의 삭제 비트만 켠다. 레코드는 링크에
              그대로 남아 있다.
            </li>
            <li>
              <b>목록으로 옮기기</b> — 이 레코드를 볼 트랜잭션이 더 없으면 퍼지
              스레드가 키 순서 링크에서 빼내 삭제된 레코드 목록의 맨 앞에
              넣는다. <code>PAGE_FREE</code> 가 이 레코드를 가리키게 되고,{" "}
              <code>PAGE_GARBAGE</code> 는 레코드 크기만큼 늘어난다.
            </li>
            <li>
              <b>재사용</b> — 다음 삽입 때 <code>PAGE_FREE</code> 의 첫 레코드
              자리가 새 레코드보다 크거나 같으면 그 자리에 쓴다. 작으면 Free
              Space 에서 새로 받는다.
            </li>
          </ol>
          <p>
            Free Space 는 모자라지만 <code>PAGE_GARBAGE</code> 까지 합치면
            들어갈 수 있을 때는 페이지를 <b>재구성</b>한다. 살아 있는 레코드를
            키 순서대로 앞에서부터 다시 써서 흩어진 빈 자리를 Free Space 하나로
            모은다. 그래도 모자라면 분할한다.
          </p>
        </Sub>

        <Sub title="Free Space">
          <p>
            따로 구조가 없는 빈 구간이다. 시작은 <code>PAGE_HEAP_TOP</code>,
            끝은 Page Directory 의 마지막 슬롯 앞이다. 새 레코드를 쓰면{" "}
            <code>PAGE_HEAP_TOP</code> 이 뒤로 가고, 슬롯이 늘면 끝이 앞으로
            온다.
          </p>
        </Sub>

        <Sub title="Page Directory">
          <p>
            슬롯 하나는 2 byte 이고 <b>레코드 하나의 위치</b>(페이지 시작에서 몇
            byte 인지)가 들어 있다. 슬롯은 페이지 끝에서부터 거꾸로 놓여, File
            Trailer 바로 앞이 슬롯 0 이다. 개수는 <code>PAGE_N_DIR_SLOTS</code>{" "}
            에 있다.
          </p>
          <p>
            레코드마다 슬롯을 두지는 않는다. 키 순서 링크에서 레코드 4~8개마다
            하나씩, 그 가운데 <b>한 레코드만</b> 슬롯이 가리킨다. 슬롯과 슬롯
            사이에 있는 레코드는 어느 슬롯도 가리키지 않으므로, 앞 슬롯이
            가리키는 레코드에서 링크를 따라가야 닿는다. 슬롯에 키 값은 없다.
          </p>
          <p>
            슬롯이 가리키는 레코드의 헤더(<code>n_owned</code>)에는 숫자가 하나
            적힌다. 앞 슬롯이 가리키는 레코드 다음부터 자기까지, 레코드가 몇
            개인지다. 슬롯이 가리키지 않는 레코드는 이 값이 0 이다.
          </p>
          <ul className="doc-steps">
            <li>
              <b>슬롯 0</b> — infimum 을 가리킨다. 앞에 레코드가 없으므로 이
              숫자는 1 이다.
            </li>
            <li>
              <b>가운데 슬롯</b> — 4~8. 자기를 포함한 수이므로, 앞 슬롯과의
              사이에 있는 레코드는 3~7개다.
            </li>
            <li>
              <b>마지막 슬롯</b> — supremum 을 가리킨다. 1~8. 역시 supremum 을
              포함한 수다.
            </li>
          </ul>
          <p>
            삽입으로 이 숫자가 9 가 되면 그 사이에 슬롯을 하나 더 넣어 둘로
            나눈다. 삭제로 4 밑이 되면 옆 슬롯의 위치를 한 레코드 옮겨 균형을
            맞추거나, 슬롯 하나를 없애 두 구간을 합친다.
          </p>
        </Sub>

        <Sub title="File Trailer">
          <p>
            File Header 처럼 모든 종류의 페이지가 갖는 마지막 8 byte 다.
            페이지를 디스크에서 읽을 때 헤더의 값과 맞춰 본다.
          </p>
          <Figure>
            <Fields title="File Trailer" size="8 byte" rows={TRAILER} />
          </Figure>
          <p>
            16KB 를 쓰는 도중에 서버가 죽으면 앞부분만 새 내용이고 뒷부분은 옛
            내용인 페이지가 남는다. 이때 헤더와 트레일러의 값이 서로 맞지 않아
            깨진 페이지임을 알 수 있고, Doublewrite Buffer 에 있는 온전한
            사본으로 되돌린다.
          </p>
        </Sub>
      </Block>

      <Block title="레코드 순서와 next_record 링크">
        <p>
          레코드는 들어온 순서대로 빈 자리에 쌓인다. 대신 레코드마다{" "}
          <b>다음 레코드까지의 거리</b>를 들고 있어서, infimum 에서 시작해
          링크를 따라가면 키 순서대로 지나가게 된다. 그래서 가운데 값을 넣어도
          뒤의 레코드를 밀어 옮길 필요가 없다.
        </p>

        <Figure>
          <RecordLinkDiagram />
        </Figure>

        <p>
          디렉터리가 없으면 페이지 안에서 원하는 키를 찾을 때 링크를 처음부터
          끝까지 따라가야 한다. 슬롯 덕분에{" "}
          <b>슬롯 이진 탐색 → 그 구간만 링크 따라가기</b>로 줄어든다.
        </p>
      </Block>

      <Block title="레코드 삽입과 삭제" id="record-insert-delete">
        <p>
          삽입과 삭제는 레코드를 옮기지 않고 <b>링크만 고쳐서</b> 처리한다. 새
          레코드는 빈 자리에 쓰고 앞 레코드의 <code>next_record</code> 를 새
          레코드로 돌린다. 지운 레코드는 키 순서 링크에서 빼내, 삭제된 자리끼리
          잇는 또 하나의 목록(<code>PAGE_FREE</code>)에 넣어 두었다가 다음 삽입
          때 다시 쓴다.
        </p>

        <Figure caption="레코드 네 개로 시작해 삽입 · 삭제 · 재사용을 차례로 한 페이지. 왼쪽은 자리, 오른쪽은 그 자리들을 잇는 두 목록이다. 이번 단계에서 바뀐 레코드는 양쪽에 파란 테두리로 표시된다.">
          <HeapDemo />
        </Figure>

        <p>
          삽입할 때는 <code>PAGE_FREE</code> 의 <b>첫 자리만</b> 본다. 그 자리가
          새 레코드보다 작으면 목록을 더 뒤지지 않고 Free Space 에서 받는다.
          그래서 삭제된 자리가 쓰이지 않은 채 남을 수 있고, 이런 자리는 페이지를
          재구성할 때 Free Space 로 합쳐진다.
        </p>
      </Block>

      <Block title="페이지 안에서 레코드 찾기">
        <p>
          슬롯은 키 순서로 정렬되어 있으므로 이분 탐색을 할 수 있다. 슬롯 두
          개를 <b>아래 경계</b>와 <b>위 경계</b>로 잡고, 그 가운데 슬롯이
          가리키는 레코드의 키와 비교해 경계 하나를 가운데로 옮긴다. 슬롯에는
          위치만 있어서, 비교할 때마다 그 위치의 레코드로 가서 키를 읽는다. 두
          경계가 붙으면 그 두 슬롯 사이에서만 링크를 따라간다.
        </p>

        <Figure caption="키 1 부터 20 까지 든 페이지에서 키 14 를 찾는 과정. 레코드는 링크 순서(키 순서)로 한 줄에 그렸다. 슬롯은 레코드 하나만 가리키고, 슬롯과 슬롯 사이의 레코드는 링크를 따라가야 닿는다.">
          <SeekDemo />
        </Figure>

        <p>
          찾는 키가 페이지에 없을 때도 과정은 같다. 13 다음에 15 가 나오면 14 가
          들어갈 자리가 그 사이라는 것을 알게 되고, 삽입할 위치도 이렇게 찾는다.
        </p>
      </Block>

      <Block title="페이지 분할과 병합">
        <p>
          빈 공간이 모자란데 삽입이 들어오면 페이지가 <b>분할</b>된다. 새
          페이지를 하나 만들고 절반을 옮긴 뒤, 부모 페이지에 새 이정표를 넣는다.
          반대로 삭제가 쌓여 사용량이 기준(기본 50%,{" "}
          <code>MERGE_THRESHOLD</code>) 밑으로 내려가면 옆 페이지와 <b>병합</b>
          을 시도한다.
        </p>
        <p>
          다만 빈 공간이 모자란다고 바로 분할하지는 않는다. 먼저 Free Space 와{" "}
          <code>PAGE_GARBAGE</code> 를 더해, 삭제된 자리를 모으면 새 레코드가
          들어가는지 <b>계산</b>한다. 들어가면 페이지를 <b>재구성</b>해 흩어진
          자리를 Free Space 하나로 모은 뒤 삽입하고, 계산해서 안 들어갈 때만
          분할한다. 재구성은 레코드를 키 순서대로 앞에서부터 다시 쓰는 일이라
          삽입 한 번보다 비싸지만, 새 페이지를 받고 부모 페이지까지 고치는
          분할보다는 싸다.
        </p>

        <Sub title="순서대로 들어올 때">
          <p>
            만약 <code>AUTO_INCREMENT</code> 처럼 키가 순서대로 들어온다는 경우,
            새로운 레코드들은 기존 페이지가 아닌 새 페이지에 저장된다. 이때
            보통의 분할처럼 레코드를 반씩 나누면, 왼쪽 페이지는 앞으로 삽입이
            오지 않는데도 절반이 빈 채로 남는다. 이런 페이지가 계속 쌓여 같은
            데이터를 담는 데 페이지가 두 배 가까이 든다.
          </p>
          <p>
            이를 해결하기 위해 Page Header 에 직전 삽입의 기록을 저장하여 처리한다.
          </p>
          <ul className="doc-steps">
            <li>
              <b>PAGE_LAST_INSERT</b> — 이 페이지에 마지막으로 넣은 레코드의
              위치
            </li>
            <li>
              <b>PAGE_DIRECTION</b> — 최근 삽입이 이어진 방향. 오른쪽 · 왼쪽 ·
              없음
            </li>
            <li>
              <b>PAGE_N_DIRECTION</b> — 같은 방향으로 연속해서 들어온 횟수
            </li>
          </ul>
          <p>
            삽입할 때마다 이 세 값을 고쳐 둔다. 그러다 페이지가 꽉 차 새 페이지가
            필요해지면, 이 값으로 지금 삽입이 순차 삽입인지 판단한다. 새 레코드가{" "}
            <code>PAGE_LAST_INSERT</code> 가 가리키는 레코드 바로 뒤, 곧 페이지의
            끝에 들어가는 자리이고, 최근 삽입이 오른쪽으로 이어져 왔다면 순차
            삽입으로 본다.
          </p>
          <p>
            순차 삽입이면 <b>레코드 절반을 새 페이지로 옮기지 않는다</b>. 원래
            페이지는 꽉 찬 그대로 두고, 새 페이지에는 새 레코드만 넣는다. 다음
            삽입부터는 이 새 페이지에 이어서 쌓인다.
          </p>
          <p>
            PK 로 <code>AUTO_INCREMENT</code> 를 주로 쓰는 이유가 이것이다. 키가
            계속 커지면 새 페이지로 넘어갈 때 옮기는 레코드가 없고, 지나간
            페이지는 거의 꽉 찬 채로 남는다. 새 페이지도 지금 페이지 바로 다음
            번호로 받아 파일 안에서 이어져 놓인다. 랜덤 PK 는 가운데서 계속
            나뉘어 페이지마다 빈자리가 생기므로, 같은 행 수를 담는 데 페이지가 더
            많이 든다.
          </p>
        </Sub>
        <Note>
          이 시뮬레이터의 페이지는 헤더 없이 레코드 3~8개만 담고, 분할 · 병합
          규칙만 실제와 같게 맞춰 두었다. B+tree 탭에서 값을 넣어 보면 분할이
          어디서 일어나는지 볼 수 있다.
        </Note>
      </Block>
    </>
  );
}

/** A fixed layout as a table of fields, in the order they sit on the page. */
function Fields({
  title,
  size,
  rows,
}: {
  title: string;
  size: string;
  rows: Field[];
}) {
  return (
    <div className="cmp">
      <div className="cmp__panel">
        <b>
          {title}
          <em>{size}</em>
        </b>
        <ul className="fieldrows">
          {rows.map(([name, bytes, note, use]) => (
            <li key={name}>
              <div className="fieldrows__name">
                <b>{name}</b>
                <i>{bytes} byte</i>
              </div>
              <div className="fieldrows__body">
                <p>{note}</p>
                {use && <p className="fieldrows__use">{use}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Clicking either side highlights the same zone, so the drawing and the text stay tied together. */
function PageMap() {
  const [activeId, setActiveId] = useState("records");

  return (
    <div className="pagemap">
      <div className="pagemap__side">
        <span className="pagemap__edge">오프셋 0</span>
        <div className="pagemap__stack">
          {ZONES.map((zone) => (
            <button
              key={zone.id}
              type="button"
              style={{ flexGrow: zone.grow }}
              className={`pagemap__zone pagemap__zone--${zone.tone} ${
                zone.id === activeId ? "pagemap__zone--active" : ""
              }`}
              onClick={() => setActiveId(zone.id)}
            >
              <span className="pagemap__name">{zone.name}</span>
              {zone.arrow && (
                <span className="pagemap__arrow">{zone.arrow}</span>
              )}
              <span className="pagemap__size">{zone.size}</span>
            </button>
          ))}
        </div>
        <span className="pagemap__edge">16KB 끝</span>
      </div>

      <ul className="pagemap__notes">
        {ZONES.map((zone) => (
          <li key={zone.id}>
            <button
              type="button"
              className={`pagemap__note ${zone.id === activeId ? "pagemap__note--active" : ""}`}
              onClick={() => setActiveId(zone.id)}
            >
              <b>{zone.name}</b>
              <code>{zone.size}</code>
              <span>{zone.role}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type HeapState = "bound" | "live" | "marked" | "freed";

interface HeapCell {
  key: string;
  state: HeapState;
}

interface HeapStep {
  /** Records in the order they sit on the page; the cells after these are Free Space. */
  cells: HeapCell[];
  /** Index of the cell this step touched. */
  changed?: number;
  /** Key-order chain from infimum to supremum. */
  chain: string[];
  /** PAGE_FREE list, head first. */
  free: string[];
  title: string;
  text: string;
}

const HEAP_SIZE = 12;

function heapCells(
  ...entries: Array<string | [string, HeapState]>
): HeapCell[] {
  return entries.map((entry) => {
    if (typeof entry !== "string") return { key: entry[0], state: entry[1] };
    const bound = entry === "infimum" || entry === "supremum";
    return { key: entry, state: bound ? "bound" : "live" };
  });
}

const HEAP_STEPS: HeapStep[] = [
  {
    cells: heapCells("infimum", "supremum", "Dan", "Amy", "Gus", "Cal"),
    chain: ["infimum", "Amy", "Cal", "Dan", "Gus", "supremum"],
    free: [],
    title: "처음 상태",
    text: "Dan · Amy · Gus · Cal 순서로 넣은 페이지다. 삭제된 자리가 없어 PAGE_FREE 는 비어 있고, 다음 레코드는 PAGE_HEAP_TOP 이 가리키는 자리에 쓴다.",
  },
  {
    cells: heapCells("infimum", "supremum", "Dan", "Amy", "Gus", "Cal", "Ben"),
    changed: 6,
    chain: ["infimum", "Amy", "Ben", "Cal", "Dan", "Gus", "supremum"],
    free: [],
    title: "삽입 — Ben",
    text: "PAGE_FREE 가 비었으므로 Free Space 의 첫 자리에 쓰고 PAGE_HEAP_TOP 을 뒤로 옮긴다. Amy 의 next_record 를 Ben 으로, Ben 의 next_record 를 Cal 로 잇는다. 다른 레코드는 움직이지 않는다.",
  },
  {
    cells: heapCells(
      "infimum",
      "supremum",
      "Dan",
      "Amy",
      "Gus",
      ["Cal", "marked"],
      "Ben",
    ),
    changed: 5,
    chain: ["infimum", "Amy", "Ben", "Cal", "Dan", "Gus", "supremum"],
    free: [],
    title: "삭제 — Cal 에 삭제 표시",
    text: "DELETE 는 레코드 헤더의 삭제 비트만 켠다. Cal 은 자리에도, 키 순서 링크에도 그대로 있다. 이 레코드를 아직 읽어야 하는 트랜잭션이 있을 수 있기 때문이다.",
  },
  {
    cells: heapCells(
      "infimum",
      "supremum",
      "Dan",
      "Amy",
      "Gus",
      ["Cal", "freed"],
      "Ben",
    ),
    changed: 5,
    chain: ["infimum", "Amy", "Ben", "Dan", "Gus", "supremum"],
    free: ["Cal"],
    title: "퍼지 — Cal 을 링크에서 빼기",
    text: "Cal 을 볼 트랜잭션이 더 없으면 퍼지 스레드가 Ben 의 next_record 를 Dan 으로 바로 잇는다. Cal 의 자리는 PAGE_FREE 목록의 맨 앞에 들어가고, PAGE_GARBAGE 가 그 크기만큼 늘어난다.",
  },
  {
    cells: heapCells(
      "infimum",
      "supremum",
      "Dan",
      ["Amy", "freed"],
      "Gus",
      ["Cal", "freed"],
      "Ben",
    ),
    changed: 3,
    chain: ["infimum", "Ben", "Dan", "Gus", "supremum"],
    free: ["Amy", "Cal"],
    title: "삭제와 퍼지 — Amy",
    text: "Amy 도 같은 과정을 거친다. 나중에 삭제된 자리가 목록의 맨 앞에 오므로 PAGE_FREE 는 Amy 의 자리를 가리키고, 그 자리가 Cal 의 자리로 이어진다.",
  },
  {
    cells: heapCells(
      "infimum",
      "supremum",
      "Dan",
      "Eve",
      "Gus",
      ["Cal", "freed"],
      "Ben",
    ),
    changed: 3,
    chain: ["infimum", "Ben", "Dan", "Eve", "Gus", "supremum"],
    free: ["Cal"],
    title: "삽입 — Eve, 삭제된 자리 재사용",
    text: "PAGE_FREE 의 첫 자리(Amy 가 있던 곳)가 Eve 를 담을 만큼 크다. 그 자리를 목록에서 떼어 Eve 를 쓰고, Dan 과 Gus 사이에 링크로 끼운다. PAGE_HEAP_TOP 은 그대로다.",
  },
  {
    cells: heapCells(
      "infimum",
      "supremum",
      "Dan",
      "Eve",
      "Gus",
      ["Cal", "freed"],
      "Ben",
      "Fay",
    ),
    changed: 7,
    chain: ["infimum", "Ben", "Dan", "Eve", "Fay", "Gus", "supremum"],
    free: ["Cal"],
    title: "삽입 — Fay, 첫 자리가 작을 때",
    text: "Fay 는 다른 컬럼이 길어 Cal 이 있던 자리보다 크다. 첫 자리가 작으면 목록을 더 보지 않고 Free Space 에서 받는다. Cal 의 자리는 PAGE_FREE 에 그대로 남는다.",
  },
];

const HEAP_TAG: Partial<Record<HeapState, string>> = {
  marked: "삭제 표시",
  freed: "삭제된 자리",
};

/** Steps through inserts and deletes on one page: where the bytes go, and which list links them. */
function HeapDemo() {
  const [index, setIndex] = useState(0);
  const step = HEAP_STEPS[index]!;
  // The record this step touched, so the same change can be found in the lists on the right.
  const changedKey =
    step.changed === undefined ? null : step.cells[step.changed]!.key;
  const marked = new Set(
    step.cells
      .filter((cell) => cell.state === "marked")
      .map((cell) => cell.key),
  );

  return (
    <div className="seek">
      <div className="order">
        <div className="order__panel">
          <b>
            실제 페이지 배치<em>빈 칸은 Free Space</em>
          </b>
          <ol className="order__heap order__heap--states">
            {Array.from({ length: HEAP_SIZE }, (_, position) => {
              const cell = step.cells[position];
              const changed = position === step.changed;
              if (!cell) {
                return (
                  <li key={position} className="order__rec order__rec--empty">
                    {position === step.cells.length && <em>PAGE_HEAP_TOP</em>}
                  </li>
                );
              }
              return (
                <li
                  key={position}
                  className={`order__rec order__rec--${cell.state} ${
                    changed ? "order__rec--changed" : ""
                  }`}
                >
                  <span>{recordLabel(cell.key)}</span>
                  {HEAP_TAG[cell.state] && <em>{HEAP_TAG[cell.state]}</em>}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="order__panel">
          <b>
            키 순서 링크<em>infimum 에서 시작</em>
          </b>
          <div className="order__list order__list--two">
            {step.chain.map((key, position) => (
              <span key={key} className="order__item">
                {position > 0 && <i className="order__arrow">→</i>}
                <span
                  className={`order__rec ${
                    key === "infimum" || key === "supremum"
                      ? "order__rec--bound"
                      : ""
                  } ${marked.has(key) ? "order__rec--marked" : ""} ${
                    key === changedKey ? "order__rec--changed" : ""
                  }`}
                >
                  {key}
                </span>
              </span>
            ))}
          </div>

          <b>
            삭제된 자리 목록<em>PAGE_FREE 에서 시작</em>
          </b>
          <div className="order__list">
            <span className="order__item">
              <span className="order__rec order__rec--head">PAGE_FREE</span>
            </span>
            {step.free.length === 0 ? (
              <span className="order__item order__none">비어 있음</span>
            ) : (
              step.free.map((key) => (
                <span key={key} className="order__item">
                  <i className="order__arrow">→</i>
                  <span
                    className={`order__rec order__rec--freed ${
                      key === changedKey ? "order__rec--changed" : ""
                    }`}
                  >
                    {key} 자리
                  </span>
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="seek__panel">
        <p className="seek__text seek__text--tall">
          <b>
            {index + 1}. {step.title}
          </b>
          {step.text}
        </p>
        <div className="seek__controls">
          <button
            type="button"
            className="button"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
          >
            ← 이전
          </button>
          <span className="seek__count">
            {index + 1} / {HEAP_STEPS.length}
          </span>
          {index < HEAP_STEPS.length - 1 ? (
            <button
              type="button"
              className="button button--primary"
              onClick={() => setIndex(index + 1)}
            >
              다음 →
            </button>
          ) : (
            <button
              type="button"
              className="button"
              onClick={() => setIndex(0)}
            >
              처음부터
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Key-ordered groups of the example page; each group's last record is what its slot points at. */
const SEEK_GROUPS: string[][] = [
  ["infimum"],
  ["1", "2", "3", "4"],
  ["5", "6", "7", "8"],
  ["9", "10", "11", "12"],
  ["13", "14", "15", "16"],
  ["17", "18", "19", "20", "supremum"],
];

interface SeekStep {
  /** Lower bound slot: the key sits after the record this slot points at. */
  low: number;
  /** Upper bound slot: the key sits at or before the record this slot points at. */
  up: number;
  /** Slot being compared in this step, if any. */
  probe?: number;
  /** Records visited while following links inside the group. */
  walk?: string[];
  title: string;
  text: string;
}

const SEEK_STEPS: SeekStep[] = [
  {
    low: 0,
    up: 5,
    title: "경계 두 개로 시작",
    text: "아래 경계는 슬롯 0, 위 경계는 슬롯 5 다. 찾는 키는 아래 경계가 가리키는 레코드보다 뒤에, 위 경계가 가리키는 레코드와 같거나 앞에 있다.",
  },
  {
    low: 0,
    up: 5,
    probe: 2,
    title: "두 경계의 가운데, 슬롯 2",
    text: "슬롯 2 가 가리키는 레코드의 키는 8 이다. 14 는 8 보다 뒤에 있으므로 아래 경계를 슬롯 2 로 옮긴다.",
  },
  {
    low: 2,
    up: 5,
    probe: 3,
    title: "슬롯 2 와 5 의 가운데, 슬롯 3",
    text: "슬롯 2 가 가리키는 키 8 까지는 후보에서 빠졌다. 슬롯 3 의 키는 12 다. 14 는 12 보다 뒤에 있으므로 아래 경계를 슬롯 3 으로 옮긴다.",
  },
  {
    low: 3,
    up: 5,
    probe: 4,
    title: "슬롯 3 과 5 의 가운데, 슬롯 4",
    text: "슬롯 4 의 키는 16 이다. 14 는 16 보다 앞에 있으므로 위 경계를 슬롯 4 로 옮긴다.",
  },
  {
    low: 3,
    up: 4,
    title: "두 경계가 붙으면 끝",
    text: "14 는 키 12 보다 뒤, 키 16 과 같거나 앞에 있다. 남은 후보는 슬롯 3 과 슬롯 4 사이의 레코드다.",
  },
  {
    low: 3,
    up: 4,
    walk: ["12", "13", "14"],
    title: "두 슬롯 사이에서 링크 따라가기",
    text: "아래 경계가 가리키는 키 12 레코드에서 next_record 로 하나씩 가서 13, 14 를 만난다. 두 슬롯 사이의 레코드는 7개까지이므로, 위 경계의 레코드까지 가도 많아야 8번이다.",
  },
];

const SEEK_TARGET = "14";

/** Grid column of each record when the whole chain is laid out in one row. */
const SEEK_COLUMN: Record<string, number> = Object.fromEntries(
  SEEK_GROUPS.flat().map((key, position) => [key, position + 1]),
);

/** Steps through one in-page lookup: binary search over slots, then a short walk along the links. */
function SeekDemo() {
  const [index, setIndex] = useState(0);
  const step = SEEK_STEPS[index]!;
  const { low, up } = step;
  const probed =
    step.probe === undefined ? null : SEEK_GROUPS[step.probe]!.at(-1)!;
  // The lower bound's own record stays lit: the walk in the last step starts from it.
  const lowRecord = SEEK_GROUPS[low]!.at(-1)!;

  return (
    <div className="seek">
      <div className="seek__scroll">
        <div className="seek__row">
          {SEEK_GROUPS.flatMap((records, slot) => {
            const candidate = slot > low && slot <= up;
            const bound =
              slot === low ? "아래 경계" : slot === up ? "위 경계" : null;
            const probing = slot === step.probe;
            return records.map((key, position) => {
              const column = SEEK_COLUMN[key]!;
              // Only the last record of a group has a slot pointing at it.
              const pointed = position === records.length - 1;
              const walked = step.walk?.includes(key) ?? false;
              const found = walked && key === SEEK_TARGET;
              const lit = candidate || key === lowRecord;
              return (
                <Fragment key={key}>
                  {pointed && bound && (
                    <em
                      className="seek__bound"
                      style={{ gridColumn: column, gridRow: 1 }}
                    >
                      {bound}
                    </em>
                  )}
                  {pointed && (
                    <span
                      className={`seek__slot ${bound ? "seek__slot--bound" : ""} ${
                        probing ? "seek__slot--probe" : ""
                      } ${candidate || bound ? "" : "seek__dim"}`}
                      style={{ gridColumn: column, gridRow: 2 }}
                    >
                      슬롯 {slot}
                    </span>
                  )}
                  {pointed && (
                    <i
                      className={`seek__pointer ${probing ? "seek__pointer--probe" : ""} ${
                        candidate || bound ? "" : "seek__dim"
                      }`}
                      style={{ gridColumn: column, gridRow: 3 }}
                    >
                      ↓
                    </i>
                  )}
                  <span
                    className={`seek__rec ${key === probed ? "seek__rec--probe" : ""} ${
                      walked ? "seek__rec--walk" : ""
                    } ${found ? "seek__rec--found" : ""} ${lit ? "" : "seek__dim"}`}
                    style={{ gridColumn: column, gridRow: 4 }}
                  >
                    {key}
                  </span>
                </Fragment>
              );
            });
          })}
        </div>
      </div>

      <div className="seek__panel">
        <p className="seek__text">
          <b>
            {index + 1}. {step.title}
          </b>
          {step.text}
        </p>
        <div className="seek__controls">
          <button
            type="button"
            className="button"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
          >
            ← 이전
          </button>
          <span className="seek__count">
            {index + 1} / {SEEK_STEPS.length}
          </span>
          {index < SEEK_STEPS.length - 1 ? (
            <button
              type="button"
              className="button button--primary"
              onClick={() => setIndex(index + 1)}
            >
              다음 →
            </button>
          ) : (
            <button
              type="button"
              className="button"
              onClick={() => setIndex(0)}
            >
              처음부터
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Records in the order they sit on the page: infimum and supremum are written when the page is
 * created, then each record takes the next free spot in the order it was inserted.
 */
const PLACED = [
  "infimum",
  "supremum",
  "Dan",
  "Amy",
  "Gus",
  "Cal",
  "Jay",
  "Ben",
  "Hal",
  "Eve",
  "Ivy",
  "Fay",
];

/** The same records in the order the next_record links visit them, which is key order. */
const CHAIN = [
  "infimum",
  "Amy",
  "Ben",
  "Cal",
  "Dan",
  "Eve",
  "Fay",
  "Gus",
  "Hal",
  "Ivy",
  "Jay",
  "supremum",
];

const CHAIN_PER_ROW = 4;

function recordLabel(key: string) {
  return key === "infimum" || key === "supremum" ? key : `name = ${key}`;
}

/**
 * Two views of one page side by side instead of arrows drawn across the layout: with more than a
 * few records the crossing links stop being readable. Pointing at a record lights it up in both.
 */
function RecordLinkDiagram() {
  const [active, setActive] = useState<string | null>(null);
  const tone = (key: string) => {
    const bound = key === "infimum" || key === "supremum";
    return `${bound ? "order__rec--bound" : ""} ${key === active ? "order__rec--active" : ""}`;
  };

  return (
    <div className="order" onMouseLeave={() => setActive(null)}>
      <div className="order__panel">
        <b>
          실제 페이지 배치<em>들어온 순서대로 앞에서부터 놓인다</em>
        </b>
        <ol className="order__heap">
          {PLACED.map((key) => (
            <li
              key={key}
              className={`order__rec ${tone(key)}`}
              onMouseEnter={() => setActive(key)}
            >
              {recordLabel(key)}
            </li>
          ))}
        </ol>
      </div>

      <div className="order__panel">
        <b>
          링크로 이어진 순서<em>next_record 를 따라간 순서 · 키 순서</em>
        </b>
        <div className="order__chain">
          {CHAIN.map((key, position) => {
            // Rows alternate direction so the chain turns at each end instead of jumping back.
            const row = Math.floor(position / CHAIN_PER_ROW);
            const step = position % CHAIN_PER_ROW;
            const reversed = row % 2 === 1;
            const column = reversed ? CHAIN_PER_ROW - 1 - step : step;
            const last = position === CHAIN.length - 1;
            const turning = step === CHAIN_PER_ROW - 1;
            return (
              <Fragment key={key}>
                <span
                  className={`order__rec ${tone(key)}`}
                  style={{ gridColumn: column * 2 + 1, gridRow: row * 2 + 1 }}
                  onMouseEnter={() => setActive(key)}
                >
                  {recordLabel(key)}
                </span>
                {!last && (
                  <i
                    className="order__arrow"
                    style={
                      turning
                        ? { gridColumn: column * 2 + 1, gridRow: row * 2 + 2 }
                        : {
                            gridColumn: reversed ? column * 2 : column * 2 + 2,
                            gridRow: row * 2 + 1,
                          }
                    }
                  >
                    {turning ? "↓" : reversed ? "←" : "→"}
                  </i>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

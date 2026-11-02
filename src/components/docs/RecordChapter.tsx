import { Fragment, useState } from "react";
import {
  Block,
  Fields,
  Figure,
  Note,
  Sub,
  type Field as Layout,
} from "./parts";

interface Field {
  name: string;
  size: string;
  tone: "meta" | "header" | "hidden" | "value";
  note: string;
}

const FIELDS: Field[] = [
  {
    name: "가변 길이 목록",
    size: "컬럼당 1~2B",
    tone: "meta",
    note: "VARCHAR 처럼 길이가 정해지지 않은 컬럼의 실제 길이. 컬럼 역순으로 적힌다",
  },
  {
    name: "NULL 비트맵",
    size: "NULL 허용 컬럼 수 / 8B",
    tone: "meta",
    note: "NULL 인 컬럼은 값 영역에 아무 byte 도 쓰지 않는다. 여기 비트 하나로 끝",
  },
  {
    name: "레코드 헤더",
    size: "5B",
    tone: "header",
    note: "삭제 표시, 힙 번호, 레코드 종류, 이 레코드가 거느린 수, 그리고 next_record 오프셋",
  },
  {
    name: "PK 컬럼",
    size: "가변",
    tone: "value",
    note: "클러스터드 인덱스의 키. 여기서는 id",
  },
  {
    name: "DB_TRX_ID",
    size: "6B",
    tone: "hidden",
    note: "이 행을 마지막으로 바꾼 트랜잭션 id. 읽는 쪽이 “내가 볼 수 있는 버전인가”를 판단하는 값",
  },
  {
    name: "DB_ROLL_PTR",
    size: "7B",
    tone: "hidden",
    note: "바꾸기 전 값이 든 undo 레코드의 주소. 이 포인터가 버전 체인을 만든다",
  },
  {
    name: "나머지 컬럼 값",
    size: "가변",
    tone: "value",
    note: "name, email … 선언 순서대로",
  },
];

const RECORD_HEADER: Layout[] = [
  ["(쓰지 않음)", 2, "예약된 비트"],
  [
    "delete_mask",
    1,
    "삭제 표시. DELETE 를 실행하면 1 이 된다",
    "읽는 쪽은 버전 판단을 거쳐 이 레코드를 건너뛰고, 퍼지 스레드는 이 표시를 보고 레코드를 키 순서 링크에서 빼낸다",
  ],
  [
    "min_rec_mask",
    1,
    "논리프 레벨에서 가장 왼쪽 레코드에만 1",
    '이 레코드의 키는 "그 레벨의 어떤 값보다도 작다"로 취급한다. 루트에서 내려갈 때 가장 왼쪽 자식으로 갈 길이 항상 있게 한다',
  ],
  [
    "n_owned",
    4,
    "슬롯이 가리키는 레코드에만 값이 있다. 앞 슬롯의 레코드 다음부터 자기까지의 레코드 수",
    "삽입 · 삭제 때 이 값이 8 을 넘거나 4 밑이 되면 슬롯을 나누거나 합친다",
  ],
  [
    "heap_no",
    13,
    "페이지 안에서 자리를 받은 순서 번호. infimum 이 0, supremum 이 1, 사용자 레코드는 2 부터",
    '레코드 락은 "이 페이지의 몇 번 heap_no" 로 대상 레코드를 가리킨다. 레코드가 이 번호를 갖는 한 락의 대상도 바뀌지 않는다',
  ],
  [
    "record_type",
    3,
    "레코드 종류. 0 일반(리프), 1 노드 포인터(논리프), 2 infimum, 3 supremum",
    "레코드를 어떤 모양으로 읽을지 정한다. 노드 포인터면 값 뒤에 자식 페이지 번호가 붙어 있다",
  ],
  [
    "next_record",
    16,
    "키 순서로 다음 레코드까지의 거리. 이 레코드의 값 시작 지점에서 다음 레코드의 값 시작 지점까지",
    "페이지 안의 키 순서 링크를 따라갈 때 읽는다. supremum 은 0 이다",
  ],
];

const ROLL_PTR: Layout[] = [
  [
    "insert 여부",
    "1 bit",
    "이 버전이 INSERT 로 만들어졌으면 1. 이전 버전이 없다는 뜻이다",
  ],
  ["롤백 세그먼트 ID", "7 bit", "언두 로그가 든 롤백 세그먼트의 번호"],
  ["페이지 번호", 4, "언두 레코드가 든 언두 페이지의 번호"],
  ["오프셋", 2, "그 페이지 안에서 언두 레코드가 시작되는 위치"],
];

const EXTERN_REF: Layout[] = [
  ["space ID", 4, "오버플로 페이지가 있는 테이블스페이스의 ID"],
  ["페이지 번호", 4, "값이 시작되는 첫 오버플로 페이지의 번호"],
  ["오프셋", 4, "그 페이지 안에서 값이 시작되는 위치"],
  [
    "길이",
    8,
    "페이지 밖에 저장된 값의 전체 길이",
    "앞쪽 몇 비트는 이 값을 누가 지울 수 있는지 같은 관리용 표시로 쓴다",
  ],
];

const TONE_LABEL: Record<Field["tone"], string> = {
  meta: "길이 · NULL 정보",
  header: "헤더",
  hidden: "Hidden Column",
  value: "값",
};

/** One row on disk, byte by byte, and the two hidden columns that make MVCC possible. */
export function RecordChapter() {
  return (
    <>
      <p className="doc-lead">
        레코드는 페이지에 저장된 행 하나다. 컬럼 길이와 NULL 여부를 적는{" "}
        <b>길이 · NULL 정보</b>, 페이지 안의 링크와 상태를 적는{" "}
        <b>레코드 헤더</b>, 트랜잭션이 버전을 판단하는 데 쓰는{" "}
        <b>Hidden Column</b>, 그리고 실제 <b>컬럼 값</b>으로 구성된다.
      </p>

      <Figure>
        <div className="rec">
          {FIELDS.map((field) => (
            <Fragment key={field.name}>
              <div className={`rec__field rec__field--${field.tone}`}>
                <span className="rec__tone">{TONE_LABEL[field.tone]}</span>
                <b>{field.name}</b>
                <code>{field.size}</code>
                <span className="rec__note">{field.note}</span>
              </div>
              {field.tone === "header" && (
                <div className="rec__origin">
                  <b>origin - </b>
                  <span>슬롯 · next_record 가 가리키는 곳</span>
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </Figure>

      <Block title="항목별 구조">
        <p>
          그림의 칸은 위에서부터 놓인 순서다. 슬롯과 <code>next_record</code> 가
          가리키는 지점은 레코드의 맨 앞이 아니라{" "}
          <b>레코드 헤더가 끝나고 값이 시작되는 곳</b>이다. 그 지점에서 앞쪽으로
          헤더 · NULL 비트맵 · 가변 길이 목록을, 뒤쪽으로 값을 읽는다.
        </p>

        <Sub title="가변 길이 목록">
          <p>
            레코드에는 컬럼 사이를 가르는 구분자가 없다. 그래서{" "}
            <code>VARCHAR</code> · <code>VARBINARY</code> · <code>TEXT</code> ·{" "}
            <code>BLOB</code> 처럼 길이가 가변인 컬럼은 실제 길이를 따로 기록해
            두고, 이 길이로 컬럼을 구분한다.
          </p>
          <ul className="doc-steps">
            <li>
              <b>순서</b> — 앞쪽으로 읽어 나가기 때문에 컬럼 선언에 역순으로
              저장된다.
            </li>
            <li>
              <b>크기</b> — NULL 이 아닌 가변 길이 컬럼 하나당 1 byte 또는
              2byte. 읽는 방식은 아래와 같다.
            </li>
          </ul>
          <p>
            왼쪽으로 1byte 씩 읽는다. 2 byte 일 수 있는 컬럼이면 처음 읽은 byte
            의 맨 위 비트를 확인해서, 1 이면 왼쪽으로 1 byte 를 더 읽는다.
          </p>
          <table className="doc-table">
            <thead>
              <tr>
                <th>컬럼 최대 길이</th>
                <th>처음 읽은 byte 의 맨 위 비트</th>
                <th>칸 크기</th>
                <th>데이터 크기</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>255 byte 이하</td>
                <td>보지 않음</td>
                <td>1 byte</td>
                <td>0 ~ 255</td>
              </tr>
              <tr>
                <td rowSpan={2}>255 byte 초과, TEXT · BLOB</td>
                <td>0</td>
                <td>1 byte</td>
                <td>0 ~ 127</td>
              </tr>
              <tr>
                <td>1</td>
                <td>2 byte</td>
                <td>최대 16383 (14 bit, 남은 1 bit 는 오버플로 표시)</td>
              </tr>
            </tbody>
          </table>
          <p>
            값이 너무 길어 오버플로 페이지로 내보낸 컬럼은 레코드에 20 byte
            주소만 남는다. 그래서 칸에는 실제 값의 길이가 아니라 20 이 적히고,
            "여기 있는 건 값이 아니라 주소"라는 표시로 오버플로 비트가 켜진다.
          </p>
        </Sub>

        <Sub title="오버플로 페이지">
          <p>
            한 페이지에는 레코드가 최소 2개는 들어가야 한다. 레코드 하나가
            페이지를 혼자 차지하면 페이지를 나눠도 의미가 없기 때문이다. 그래서
            레코드 하나의 최대 크기는 16KB 의 절반이 아니라,{" "}
            <b>빈 페이지에서 레코드에 쓸 수 있는 공간의 절반</b>이다. 레코드가
            이보다 커지면 InnoDB 는 긴 컬럼 값을 다른 페이지로 옮긴다. 이
            페이지를 <b>오버플로 페이지</b>라고 한다.
          </p>
          <table className="doc-table">
            <thead>
              <tr>
                <th>항목</th>
                <th>byte</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  페이지 전체 (<code>innodb_page_size</code>)
                </td>
                <td>16384</td>
              </tr>
              <tr>
                <td>
                  − FIL Header 38 + Page Header 36 + FSEG Header 20
                </td>
                <td>−94</td>
              </tr>
              <tr>
                <td>− infimum · supremum 레코드 (각각 헤더 5 + 값 8)</td>
                <td>−26</td>
              </tr>
              <tr>
                <td>− 페이지 디렉터리 슬롯 2개</td>
                <td>−4</td>
              </tr>
              <tr>
                <td>− FIL Trailer</td>
                <td>−8</td>
              </tr>
              <tr>
                <td>
                  빈 페이지의 여유 공간 (
                  <code>page_get_free_space_of_empty()</code>)
                </td>
                <td>16252</td>
              </tr>
              <tr>
                <td>
                  <b>÷ 2 = 레코드 하나의 최대 크기</b>
                </td>
                <td>
                  <b>8126</b>
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            8126 과 비교하는 값은 컬럼 값의 합이 아니라{" "}
            <b>레코드 전체 크기</b>다. 가변 길이 목록, NULL 비트맵, 레코드 헤더
            5 byte, <code>DB_TRX_ID</code> 6 byte, <code>DB_ROLL_PTR</code> 7
            byte 까지 모두 더한다. 그래서 컬럼 값만 더했을 때 8126 보다 조금
            작아도 오버플로가 일어날 수 있다.
          </p>
          <ul className="doc-steps">
            <li>
              <b>언제</b> — INSERT · UPDATE 할 때마다 그 레코드 하나의 크기를
              따로 검사한다. 8126 이상이면 그 레코드 안에서 가장 긴 컬럼부터
              하나씩 옮기고, 8126 미만이 되면 멈춘다. 그래서 같은 컬럼이라도
              레코드마다 페이지 안에 있기도 하고 밖에 있기도 하다.
            </li>
            <li>
              <b>대상</b> — 최대 길이가 255 byte 를 넘는 컬럼과 TEXT · BLOB 만.
              짧은 컬럼은 옮기지 않으므로 1 byte 칸에는 오버플로 비트가 없다.
            </li>
            <li>
              <b>남는 것</b> — DYNAMIC(8.0 기본)은 20 byte 주소만 남긴다. 옛
              COMPACT 는 값의 앞 768 byte 를 남기고 그 뒤에 주소를 붙인다.
            </li>
          </ul>
          <Figure>
            <Fields title="오버플로 주소" size="20 byte" rows={EXTERN_REF} />
          </Figure>
          <p>
            오버플로 페이지도 같은 <code>.ibd</code> 파일의 페이지이고,
            클러스터드 인덱스가 쓰는 세그먼트에서 할당받는다. 값 하나가 페이지
            하나보다 길면 여러 페이지에 나눠 담는다. 첫 페이지에 나머지 조각이
            어느 페이지에 있는지 목록이 있어서, 그 목록을 따라 조각을 순서대로
            이어 붙인다.
          </p>
          <Figure caption="bio 값을 읽을 때. 레코드의 주소로 첫 페이지를 찾고, 그 페이지의 목록을 따라 나머지 조각을 읽는다.">
            <div className="chain">
              <div className="chain__node chain__node--current">
                <span className="chain__tag">리프 페이지 87 · 레코드</span>
                <code>bio = 20 byte 주소</code>
                <em>오버플로 비트 1</em>
              </div>
              <span className="chain__arrow">페이지 120 ▸</span>
              <div className="chain__node">
                <span className="chain__tag">오버플로 첫 페이지 120</span>
                <code>조각 목록: 121, 122</code>
                <em>전체 길이 30,000 byte</em>
              </div>
              <span className="chain__arrow">▸</span>
              <div className="chain__node">
                <span className="chain__tag">페이지 121 · 122</span>
                <code>bio 의 실제 값</code>
                <em>순서대로 이어 붙임</em>
              </div>
            </div>
          </Figure>
          <p>
            읽는 순서를 정리하면 이렇다. 가변 길이 목록에서 오버플로 비트를
            확인하고, 값 자리의 20 byte 주소를 읽고, 그 페이지 번호로 버퍼
            풀에서(없으면 디스크에서) 첫 페이지를 찾아 조각을 이어 붙인다. 이
            컬럼을 SELECT 하지 않으면 이 과정은 일어나지 않는다. 긴 컬럼이 있는
            테이블에서 <code>SELECT *</code> 가 느려지는 이유다.
          </p>
        </Sub>

        <Sub title="NULL 비트맵">
          <p>
            NULL 을 허용하는 컬럼마다 1 bit 씩, 이 레코드에서 그 값이 NULL 인지
            적는다. NULL 인 컬럼은 값 영역에 아무 byte 도 쓰지 않으므로, 이
            비트가 없으면 비어 있는 것과 다음 컬럼을 구분할 수 없다.
          </p>
          <ul className="doc-steps">
            <li>
              <b>크기</b> — NULL 허용 컬럼 수 ÷ 8 을 올림한 byte 수. 3개면 1
              byte, 9개면 2 byte.
            </li>
            <li>
              <b>없는 경우</b> — 모든 컬럼이 <code>NOT NULL</code> 이면 이
              부분이 아예 없다.
            </li>
          </ul>
        </Sub>

        <Sub title="레코드 헤더">
          <p>
            모든 레코드가 갖는 5 byte(40 bit)다. 페이지 장에서 본 삭제 표시,
            슬롯, 키 순서 링크가 모두 이 안에 있다.
          </p>
          <Figure>
            <Fields
              title="레코드 헤더"
              size="5 byte · 40 bit"
              unit="bit"
              rows={RECORD_HEADER}
            />
          </Figure>
        </Sub>

        <Sub title="PK 컬럼">
          <p>
            클러스터드 인덱스의 키 값이다. 레코드는 이 값의 순서로 링크된다.
            키를 byte 단위로 그대로 비교할 수 있게 저장하는데, 예를 들어 부호
            있는 정수는 부호 비트를 뒤집고 큰 자리부터 적는다. 그래서 음수가
            양수보다 앞에 정렬된다.
          </p>
          <p>
            논리프 페이지의 레코드(노드 포인터)도 같은 키로 시작하지만, 뒤에
            Hidden Column 과 나머지 컬럼이 없고 <b>자식 페이지 번호 4 byte</b>만
            붙는다.
          </p>
        </Sub>

        <Sub title="DB_TRX_ID">
          <p>
            이 행을 마지막으로 INSERT 하거나 UPDATE 한 트랜잭션의 ID 다. 6 byte.
            읽는 쪽은 이 값을 자기 read view 와 비교해 이 버전을 봐도 되는지
            판단한다. 어떻게 쓰이는지는 아래 「Hidden Column 의 역할」에 있다.
          </p>
        </Sub>

        <Sub title="DB_ROLL_PTR">
          <p>
            이 행의 직전 버전이 든 언두 레코드의 위치다. 7 byte 안에 언두
            레코드를 바로 찾아갈 수 있는 주소가 들어 있다.
          </p>
          <Figure>
            <Fields title="DB_ROLL_PTR" size="7 byte" rows={ROLL_PTR} />
          </Figure>
        </Sub>

        <Sub title="나머지 컬럼 값">
          <p>
            PK 가 아닌 컬럼의 값이 선언 순서대로 이어진다. 고정 길이 컬럼은
            정해진 크기만큼, 가변 길이 컬럼은 가변 길이 목록에 적힌 길이만큼
            차지하고, NULL 인 컬럼은 건너뛴다.
          </p>
          <p>
            값이 너무 길면 페이지 밖으로 내보내고 그 자리에 포인터만 남긴다.
            위 「오버플로 페이지」에서 다뤘다.
          </p>
        </Sub>

        <Sub title="레코드를 읽는 순서">
          <p>
            위 항목들을 InnoDB 가 실제로 읽는 순서대로 따라가 본다. origin 에서
            왼쪽으로 헤더 · NULL 비트맵 · 가변 길이 목록을 읽으며 각 값의 길이를
            알아내고, 그 길이로 오른쪽 값들의 위치를 정한다.
          </p>
          <Figure>
            <VarLenDemo />
          </Figure>
        </Sub>
      </Block>

      <Block title="Hidden Column 의 역할">
        <p>
          <code>DB_ROLL_PTR</code> 는 이 행의 <b>직전 버전</b>이 든 undo
          레코드를 가리킨다. 그 undo 레코드에도 자기 이전 버전을 가리키는
          포인터가 있어서, 행 하나가 시간순 사슬을 이룬다. 읽는 쪽은 자기 read
          view 기준으로 <code>DB_TRX_ID</code> 를 보며 “이 버전은 내가 보기 전에
          커밋된 것인가”를 따지고, 아니면 사슬을 한 칸 더 거슬러 올라간다.
        </p>

        <Figure caption="트랜잭션 18 이 읽을 때: 최신 버전은 아직 커밋 안 된 22 의 것이라 건너뛰고, 롤백 포인터를 따라 15 가 남긴 버전을 읽는다. 락은 하나도 필요 없다.">
          <div className="chain">
            <div className="chain__node chain__node--current">
              <span className="chain__tag">페이지 안의 현재 행</span>
              <code>id=20 · name='b2'</code>
              <em>DB_TRX_ID 22 · 아직 커밋 전</em>
            </div>
            <span className="chain__arrow">roll_ptr ▸</span>
            <div className="chain__node">
              <span className="chain__tag">undo 레코드</span>
              <code>name='b'</code>
              <em>DB_TRX_ID 15 · 커밋됨</em>
            </div>
            <span className="chain__arrow">roll_ptr ▸</span>
            <div className="chain__node chain__node--old">
              <span className="chain__tag">undo 레코드</span>
              <code>INSERT 이전 — 없음</code>
              <em>DB_TRX_ID 9</em>
            </div>
          </div>
        </Figure>

        <p>
          그래서 UPDATE 는 옛 값을 지우는 게 아니라 <b>새 버전을 앞에 붙이는</b>{" "}
          일에 가깝다. 아무도 더 옛 버전을 보지 않게 되면 purge 스레드가 그때
          정리한다. 오래 열어 둔 트랜잭션 하나가 undo 를 부풀리는 이유다.
        </p>
      </Block>

      <Block title="세컨더리 인덱스 레코드 구성">
        <p>
          세컨더리 인덱스 리프에는 <b>인덱스 키 + PK 값</b>만 들어간다. Hidden
          Column 도 없다. 대신 값이 최신인지 확실치 않을 때 PK 로 클러스터드
          인덱스를 다시 찾아가 확인한다. PK 가 길면 모든 세컨더리 인덱스가
          그만큼 같이 커진다.
        </p>
        <p>
          PK 를 아예 선언하지 않으면 InnoDB 가 <code>DB_ROW_ID</code> 라는 6
          byte 짜리 Hidden Column 을 만들어 그걸로 클러스터드 인덱스를 세운다.
          눈에 안 보일 뿐, 클러스터드 인덱스가 없는 InnoDB 테이블은 없다.
        </p>
      </Block>

      <Note>
        이 시뮬레이터의 레코드는 값과 <code>DB_TRX_ID</code> ·{" "}
        <code>DB_ROLL_PTR</code> 만 들고 있다. byte 단위 인코딩과 오버플로
        페이지는 다루지 않지만, 버전 체인과 purge 는 실제와 같은 규칙으로
        움직인다 — Redo / Undo 탭에서 볼 수 있다.
      </Note>
    </>
  );
}

interface VarLenCell {
  id: string;
  text: string;
  owner: string;
}

// Left of the origin: what InnoDB reads backwards. Right of it: the values.
const VARLEN_META: VarLenCell[] = [
  { id: "bio-low", text: "0xC8", owner: "bio 길이" },
  { id: "bio-high", text: "0x80", owner: "bio 길이" },
  { id: "name-len", text: "0x03", owner: "name 길이" },
  { id: "bitmap", text: "0x01", owner: "NULL 비트맵" },
  { id: "header", text: "5 byte", owner: "레코드 헤더" },
];

const VARLEN_VALUES: VarLenCell[] = [
  { id: "id", text: "4 byte", owner: "id" },
  { id: "trx", text: "6 byte", owner: "DB_TRX_ID" },
  { id: "roll", text: "7 byte", owner: "DB_ROLL_PTR" },
  { id: "name", text: "'Kim'", owner: "name" },
  { id: "bio", text: "200 byte", owner: "bio" },
];

const VARLEN_SCHEMA = `CREATE TABLE users (    -- utf8mb4
  id    INT PRIMARY KEY,
  name  VARCHAR(10)  NOT NULL,   -- 최대 40 byte
  email VARCHAR(255) NULL,       -- 최대 1020 byte
  bio   TEXT         NULL
);
-- 행: id=1, name='Kim', email=NULL, bio=200 byte 문자열`;

const VARLEN_LIST = new Set(["bio-low", "bio-high", "name-len"]);

const VARLEN_STEPS: { title: string; text: string; now: string[] }[] = [
  {
    title: "출발",
    text: "InnoDB 는 레코드의 가운데, 헤더와 값 사이(origin)에 도착한다. 왼쪽은 레코드 정보, 오른쪽은 값이다. 왼쪽에 몇 byte 가 있는지는 아직 모른다.",
    now: [],
  },
  {
    title: "레코드 헤더",
    text: "헤더는 항상 5 byte 다. 왼쪽으로 5 byte 를 읽는다.",
    now: ["header"],
  },
  {
    title: "NULL 비트맵",
    text: "NULL 이 될 수 있는 컬럼은 email, bio 두 개라 1 byte 다. email 자리의 비트가 1 이라 email 은 NULL, bio 자리는 0 이라 값이 있다.",
    now: ["bitmap"],
  },
  {
    title: "id · DB_TRX_ID · DB_ROLL_PTR",
    text: "이제 컬럼을 앞에서부터 하나씩 본다. 이 셋은 크기가 정해져 있어서 길이를 읽을 필요가 없다.",
    now: ["id", "trx", "roll"],
  },
  {
    title: "name — 1 byte 읽기",
    text: "name 은 최대 40 byte 라 길이 칸은 1 byte 면 충분하다. 1 byte 를 읽으면 3, name 값은 3 byte 다.",
    now: ["name-len", "name"],
  },
  {
    title: "email — 읽을 것 없음",
    text: "email 은 NULL 이라 길이도 값도 저장돼 있지 않다. 아무것도 읽지 않고 다음 컬럼으로 넘어간다.",
    now: ["bitmap"],
  },
  {
    title: "bio — 2 byte 읽기",
    text: 'bio 는 TEXT 라 길이 칸이 1 byte 일 수도, 2 byte 일 수도 있다. 1 byte 를 읽어 보니 0x80(1000 0000), 맨 앞 비트가 1 이다. "2 byte 짜리"라는 뜻이라 1 byte 를 더 읽는다. 두 byte 를 합치면 200, bio 값은 200 byte 다.',
    now: ["bio-high", "bio-low", "bio"],
  },
  {
    title: "끝",
    text: "모든 컬럼의 길이를 알았다. 왼쪽으로 읽은 9 byte 앞이 레코드의 실제 시작이고, 오른쪽 값들도 길이를 차례로 더하면 각자 어디서 시작하는지 알 수 있다.",
    now: [],
  },
];

/** Reading the variable-length list: one byte at a time leftward from the origin. */
function VarLenDemo() {
  const [index, setIndex] = useState(0);
  const step = VARLEN_STEPS[index]!;
  const read = new Set(VARLEN_STEPS.slice(0, index).flatMap((s) => s.now));

  const cell = (c: VarLenCell, column: number) => {
    const now = step.now.includes(c.id);
    const done = read.has(c.id);
    // A length byte belongs to no column until InnoDB has read it.
    const owner = VARLEN_LIST.has(c.id) && !now && !done ? "?" : c.owner;
    return [
      <span
        key={c.id}
        className={`varlen__cell ${now ? "varlen__cell--now" : done ? "varlen__cell--read" : ""}`}
        style={{ gridColumn: column, gridRow: 2 }}
      >
        {c.text}
      </span>,
      <span
        key={`${c.id}-owner`}
        className={`varlen__owner ${owner === "?" ? "" : "varlen__owner--known"}`}
        style={{ gridColumn: column, gridRow: 3 }}
      >
        {owner}
      </span>,
    ];
  };

  return (
    <div className="varlen">
      <pre className="varlen__schema">{VARLEN_SCHEMA}</pre>
      <div className="varlen__scroll">
        <div className="varlen__row">
          <span className="varlen__group" style={{ gridColumn: "1 / 4" }}>
            가변 길이 목록
          </span>
          <span className="varlen__group" style={{ gridColumn: 4 }}>
            NULL 비트맵
          </span>
          <span className="varlen__group" style={{ gridColumn: 5 }}>
            헤더
          </span>
          <span className="varlen__group" style={{ gridColumn: "7 / 12" }}>
            값
          </span>
          {VARLEN_META.flatMap((c, i) => cell(c, i + 1))}
          <i className="varlen__origin" />
          {VARLEN_VALUES.flatMap((c, i) => cell(c, i + 7))}
          <span className="varlen__dir" style={{ gridColumn: "1 / 6" }}>
            ← 왼쪽으로 읽음
          </span>
          <span className="varlen__dir varlen__dir--origin">origin</span>
          <span className="varlen__dir" style={{ gridColumn: "7 / 12" }}>
            오른쪽으로 읽음 →
          </span>
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
            {index + 1} / {VARLEN_STEPS.length}
          </span>
          {index < VARLEN_STEPS.length - 1 ? (
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

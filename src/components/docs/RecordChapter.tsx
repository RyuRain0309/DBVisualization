import { Block, Figure, Note } from './parts';

interface Field {
  name: string;
  size: string;
  tone: 'meta' | 'header' | 'hidden' | 'value';
  note: string;
}

const FIELDS: Field[] = [
  {
    name: '가변 길이 목록',
    size: '컬럼당 1~2B',
    tone: 'meta',
    note: 'VARCHAR 처럼 길이가 정해지지 않은 컬럼의 실제 길이. 컬럼 역순으로 적힌다',
  },
  {
    name: 'NULL 비트맵',
    size: 'NULL 허용 컬럼 수 / 8B',
    tone: 'meta',
    note: 'NULL 인 컬럼은 값 영역에 아무 바이트도 쓰지 않는다. 여기 비트 하나로 끝',
  },
  {
    name: '레코드 헤더',
    size: '5B',
    tone: 'header',
    note: '삭제 표시, 힙 번호, 레코드 종류, 이 레코드가 거느린 수, 그리고 next_record 오프셋',
  },
  { name: 'PK 컬럼', size: '가변', tone: 'value', note: '클러스터드 인덱스의 키. 여기서는 id' },
  {
    name: 'DB_TRX_ID',
    size: '6B',
    tone: 'hidden',
    note: '이 행을 마지막으로 바꾼 트랜잭션 id. 읽는 쪽이 “내가 볼 수 있는 버전인가”를 판단하는 값',
  },
  {
    name: 'DB_ROLL_PTR',
    size: '7B',
    tone: 'hidden',
    note: '바꾸기 전 값이 든 undo 레코드의 주소. 이 포인터가 버전 체인을 만든다',
  },
  { name: '나머지 컬럼 값', size: '가변', tone: 'value', note: 'name, email … 선언 순서대로' },
];

const TONE_LABEL: Record<Field['tone'], string> = {
  meta: '길이 · NULL 정보',
  header: '헤더',
  hidden: '숨은 컬럼',
  value: '값',
};

/** One row on disk, byte by byte, and the two hidden columns that make MVCC possible. */
export function RecordChapter() {
  return (
    <>
      <p className="doc-lead">
        <code>INSERT INTO users VALUES (10, 'a', 'a@x.com')</code> 를 실행하면 페이지 안에 이런 모양의
        바이트 덩어리가 하나 생긴다. 내가 적은 값 말고도, 트랜잭션이 쓰라고 붙는 <strong>숨은 컬럼</strong>{' '}
        두 개가 함께 들어간다.
      </p>

      <Figure caption="클러스터드 인덱스 리프 레코드 (COMPACT · DYNAMIC 행 포맷). 왼쪽 두 칸은 레코드 시작 지점 앞쪽에 거꾸로 붙는다.">
        <div className="rec">
          {FIELDS.map((field) => (
            <div key={field.name} className={`rec__field rec__field--${field.tone}`}>
              <span className="rec__tone">{TONE_LABEL[field.tone]}</span>
              <b>{field.name}</b>
              <code>{field.size}</code>
              <span className="rec__note">{field.note}</span>
            </div>
          ))}
        </div>
      </Figure>

      <Block title="숨은 컬럼 둘이 하는 일">
        <p>
          <code>DB_ROLL_PTR</code> 는 이 행의 <b>직전 버전</b>이 든 undo 레코드를 가리킨다. 그 undo
          레코드에도 자기 이전 버전을 가리키는 포인터가 있어서, 행 하나가 시간순 사슬을 이룬다. 읽는
          쪽은 자기 read view 기준으로 <code>DB_TRX_ID</code> 를 보며 “이 버전은 내가 보기 전에 커밋된
          것인가”를 따지고, 아니면 사슬을 한 칸 더 거슬러 올라간다.
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
          그래서 UPDATE 는 옛 값을 지우는 게 아니라 <b>새 버전을 앞에 붙이는</b> 일에 가깝다. 아무도 더
          옛 버전을 보지 않게 되면 purge 스레드가 그때 정리한다. 오래 열어 둔 트랜잭션 하나가 undo 를
          부풀리는 이유다.
        </p>
      </Block>

      <Block title="세컨더리 인덱스 레코드는 더 짧다">
        <p>
          세컨더리 인덱스 리프에는 <b>인덱스 키 + PK 값</b>만 들어간다. 숨은 컬럼도 없다. 대신 값이
          최신인지 확실치 않을 때 PK 로 클러스터드 인덱스를 다시 찾아가 확인한다. PK 가 길면 모든
          세컨더리 인덱스가 그만큼 같이 커진다.
        </p>
        <p>
          PK 를 아예 선언하지 않으면 InnoDB 가 <code>DB_ROW_ID</code> 6바이트짜리 숨은 키를 만들어 그걸로
          클러스터드 인덱스를 세운다. 눈에 안 보일 뿐, 클러스터드 인덱스가 없는 InnoDB 테이블은 없다.
        </p>
      </Block>

      <Block title="한 행이 페이지보다 클 때">
        <p>
          긴 TEXT · BLOB · VARCHAR 은 페이지 안에 다 못 들어간다. 행이 페이지 절반을 넘으면 긴 컬럼부터
          <b> 오버플로 페이지</b>로 옮기고, 원래 자리엔 20바이트 포인터만 남긴다. DYNAMIC 행 포맷은 값을
          통째로 내보내고, 옛 COMPACT 는 앞 768바이트를 페이지에 남긴다.
        </p>
        <Note>
          이 시뮬레이터의 레코드는 값과 <code>DB_TRX_ID</code> · <code>DB_ROLL_PTR</code> 만 들고 있다.
          바이트 단위 인코딩과 오버플로 페이지는 다루지 않지만, 버전 체인과 purge 는 실제와 같은 규칙으로
          움직인다 — Redo / Undo 탭에서 볼 수 있다.
        </Note>
      </Block>
    </>
  );
}

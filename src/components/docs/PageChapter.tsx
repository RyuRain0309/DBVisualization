import { Block, Figure, Note } from './parts';

interface Band {
  name: string;
  size: string;
  role: string;
  tone?: 'head' | 'rows' | 'free' | 'dir';
}

const BANDS: Band[] = [
  {
    name: 'File Header',
    size: '38B',
    role: '페이지 번호와 종류, 체크섬, 마지막으로 바뀐 LSN, 그리고 같은 레벨의 앞·뒤 페이지 번호',
    tone: 'head',
  },
  {
    name: 'Page Header',
    size: '56B',
    role: '레코드 수, 슬롯 수, 빈 공간이 시작되는 위치, 삭제된 레코드 목록, 이 페이지의 트리 레벨',
    tone: 'head',
  },
  {
    name: 'Infimum · Supremum',
    size: '26B',
    role: '페이지의 논리적 양 끝. 실제 데이터는 없지만 링크의 시작과 끝이고, 갭 락이 걸리는 자리이기도 하다',
    tone: 'head',
  },
  {
    name: 'User Records',
    size: '가변',
    role: '실제 행(리프) 또는 자식 페이지로 가는 이정표(논리프). 삽입된 순서대로 쌓인다',
    tone: 'rows',
  },
  { name: 'Free Space', size: '가변', role: '아직 쓰지 않은 공간. 위아래 양쪽에서 갉아먹는다', tone: 'free' },
  {
    name: 'Page Directory',
    size: '가변',
    role: '레코드 4~8개마다 슬롯 하나. 페이지 끝에서부터 거꾸로 자란다',
    tone: 'dir',
  },
  {
    name: 'File Trailer',
    size: '8B',
    role: '체크섬과 LSN 하위 4바이트. 헤더 값과 맞지 않으면 쓰다 만 페이지라는 뜻이다',
    tone: 'head',
  },
];

/** What is inside one 16KB page, and why a page is not just a sorted array of rows. */
export function PageChapter() {
  return (
    <>
      <p className="doc-lead">
        페이지 한 장은 16KB 짜리 작은 파일 같다. 앞뒤로 자기 자신을 설명하는 머리말과 꼬리말이 붙고,
        가운데에 행이 들어간다. 중요한 건 <strong>행이 키 순서대로 놓여 있지 않다</strong>는 점이다.
        순서는 자리 배치가 아니라 링크가 만든다.
      </p>

      <Figure caption="위에서 아래로 한 페이지의 구성. 그림의 높이는 실제 크기 비율이 아니다 — 대부분의 공간은 User Records 와 Free Space 가 쓴다.">
        <div className="bands">
          {BANDS.map((band) => (
            <div key={band.name} className={`band band--${band.tone ?? 'head'}`}>
              <span className="band__name">{band.name}</span>
              <span className="band__size">{band.size}</span>
              <span className="band__role">{band.role}</span>
            </div>
          ))}
        </div>
      </Figure>

      <Block title="순서는 링크가 만든다">
        <p>
          레코드는 들어온 순서대로 빈 자리에 쌓인다. 대신 레코드마다 <b>다음 레코드까지의 거리</b>를
          들고 있어서, infimum 에서 시작해 링크를 따라가면 키 순서대로 지나가게 된다. 그래서 가운데
          값을 넣어도 뒤의 레코드를 밀어 옮길 필요가 없다.
        </p>

        <Figure caption="10 · 30 · 20 순서로 넣은 페이지. 자리는 넣은 순서지만 링크는 10 → 20 → 30 으로 흐른다. 디렉터리 슬롯은 그 링크 위에서 이진 탐색을 걸 지점을 찍어 준다.">
          <RecordLinkDiagram />
        </Figure>

        <p>
          디렉터리가 없으면 페이지 안에서 원하는 키를 찾을 때 링크를 처음부터 끝까지 따라가야 한다.
          슬롯 덕분에 <b>슬롯 이진 탐색 → 그 구간만 링크 따라가기</b>로 줄어든다.
        </p>
      </Block>

      <Block title="가득 차면 나뉘고, 비면 합쳐진다">
        <p>
          빈 공간이 모자란데 삽입이 들어오면 페이지가 <b>분할</b>된다. 새 페이지를 하나 만들고 절반을
          옮긴 뒤, 부모 페이지에 새 이정표를 넣는다. 반대로 삭제가 쌓여 사용량이 기준(기본 50%,{' '}
          <code>MERGE_THRESHOLD</code>) 밑으로 내려가면 옆 페이지와 <b>병합</b>을 시도한다.
        </p>
        <p>
          PK 가 계속 커지는 값이면 분할은 늘 오른쪽 끝에서 일어나고 앞쪽 페이지는 꽉 찬 채로 남는다.
          PK 가 랜덤이면 한가운데가 계속 쪼개져 페이지마다 빈틈이 생기고, 같은 행 수를 담는 데 더 많은
          페이지가 든다. <code>AUTO_INCREMENT</code> 나 순차 UUID 를 PK 로 권하는 이유가 이것이다.
        </p>
        <Note>
          이 시뮬레이터의 페이지는 헤더 없이 레코드 3~8개만 담고, 분할 · 병합 규칙만 실제와 같게
          맞춰 두었다. B+tree 탭에서 값을 넣어 보면 분할이 어디서 일어나는지 볼 수 있다.
        </Note>
      </Block>
    </>
  );
}

const BOXES = [
  { center: 60, label: 'infimum', muted: true },
  { center: 170, label: 'id = 10' },
  { center: 280, label: 'id = 30' },
  { center: 390, label: 'id = 20' },
  { center: 500, label: 'supremum', muted: true },
];

/** infimum → 10 → 20 → 30 → supremum: the chain crosses, which is the whole point. */
const CHAIN = [
  [60, 170],
  [170, 390],
  [390, 280],
  [280, 500],
];

const SLOTS = [
  { x: 165, target: 60, label: '슬롯 0' },
  { x: 265, target: 390, label: '슬롯 1' },
  { x: 365, target: 500, label: '슬롯 2' },
];

function RecordLinkDiagram() {
  return (
    <svg className="linkmap" viewBox="0 0 570 215" role="img" aria-label="레코드 링크와 페이지 디렉터리">
      <defs>
        <marker id="doc-link-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill="var(--accent)" />
        </marker>
      </defs>

      <text className="linkmap__title" x="0" y="12">
        next_record 링크 — 키 순서
      </text>

      {CHAIN.map(([from, to]) => {
        const lift = Math.abs((to as number) - (from as number)) > 120 ? 24 : 40;
        return (
          <path
            key={`${from}-${to}`}
            className="linkmap__link"
            d={`M ${from} 72 C ${from} ${lift}, ${to} ${lift}, ${to} 72`}
            markerEnd="url(#doc-link-arrow)"
          />
        );
      })}

      {BOXES.map((box) => (
        <g key={box.label}>
          <rect
            className={`linkmap__box ${box.muted ? 'linkmap__box--muted' : ''}`}
            x={box.center - 50}
            y="72"
            width="100"
            height="34"
            rx="5"
          />
          <text className="linkmap__label" x={box.center} y="94" textAnchor="middle">
            {box.label}
          </text>
        </g>
      ))}

      <text className="linkmap__title" x="0" y="130">
        자리 배치 — 삽입 순서(heap)
      </text>

      {SLOTS.map((slot) => (
        <g key={slot.label}>
          <path className="linkmap__slotline" d={`M ${slot.x + 35} 160 L ${slot.target} 110`} />
          <rect className="linkmap__slot" x={slot.x} y="160" width="70" height="26" rx="4" />
          <text className="linkmap__label" x={slot.x + 35} y="177" textAnchor="middle">
            {slot.label}
          </text>
        </g>
      ))}

      <text className="linkmap__title" x="0" y="207">
        페이지 디렉터리 — 키 순서로 정렬된 슬롯
      </text>
    </svg>
  );
}

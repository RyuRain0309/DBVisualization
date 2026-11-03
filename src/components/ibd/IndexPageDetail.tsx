import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { IbdSpace } from '../../ibd/analyze';
import { FIL_HEADER_SIZE, FIL_TRAILER_SIZE } from '../../ibd/fil';
import {
  directorySlots,
  directoryStart,
  freeRecords,
  PAGE_DATA,
  PAGE_NEW_SUPREMUM_END,
  parseIndexHeader,
  walkRecords,
  type FsegHeader,
  type RecordHeader,
} from '../../ibd/indexPage';
import { segmentLabel } from './format';
import { DocRef, FieldTable, PageLink, Section } from './parts';

type Select = (pageNo: number) => void;

const DIRECTIONS: Record<number, string> = {
  1: 'PAGE_LEFT',
  2: 'PAGE_RIGHT',
  3: 'PAGE_SAME_REC',
  4: 'PAGE_SAME_PAGE',
  5: 'PAGE_NO_DIRECTION',
};

const STATUS_LABEL: Record<RecordHeader['status'], string> = {
  ordinary: '0 일반',
  'node-pointer': '1 노드 포인터',
  infimum: '2 infimum',
  supremum: '3 supremum',
};

interface Region {
  from: number;
  to: number;
  label: string;
  color: string;
}

function regionsOf(pageSize: number, heapTop: number, dirStart: number): Region[] {
  return [
    { from: 0, to: FIL_HEADER_SIZE, label: 'FIL Header', color: '#64748b' },
    { from: FIL_HEADER_SIZE, to: 74, label: 'Page Header', color: '#8b5cf6' },
    { from: 74, to: PAGE_DATA, label: 'FSEG Header', color: '#c4b5fd' },
    { from: PAGE_DATA, to: PAGE_NEW_SUPREMUM_END, label: 'infimum · supremum', color: '#f59e0b' },
    { from: PAGE_NEW_SUPREMUM_END, to: heapTop, label: '레코드', color: '#bfdbfe' },
    { from: heapTop, to: dirStart, label: '빈 공간', color: '#ffffff' },
    { from: dirStart, to: pageSize - FIL_TRAILER_SIZE, label: '페이지 디렉터리', color: '#10b981' },
    { from: pageSize - FIL_TRAILER_SIZE, to: pageSize, label: 'FIL Trailer', color: '#64748b' },
  ];
}

const MARK_LIVE = '#1d4ed8';
const MARK_DELETED = '#d32f2f';
const MARK_FREE = '#94a3b8';

function fseg(header: FsegHeader, space: IbdSpace, onSelect: Select) {
  if (header.page === 0 && header.offset === 0) return <span className="ibd-dim">0 (루트가 아니라 쓰지 않음)</span>;
  const segment = space.segments.find((s) => s.inodePage === header.page && s.entry.offset === header.offset);
  return (
    <>
      INODE 페이지 <PageLink pageNo={header.page} onSelect={onSelect} /> · 오프셋 {header.offset}
      {segment && <span className="ibd-dim"> → {segmentLabel(space, segment.segId)}</span>}
    </>
  );
}

export function IndexPageDetail({
  space,
  page,
  onSelect,
}: {
  space: IbdSpace;
  page: Uint8Array;
  onSelect: Select;
}) {
  const header = parseIndexHeader(page);
  const [picked, setPicked] = useState<number | null>(null);
  const index = space.indexes.find((one) => one.id === header.indexId);

  const headerTable = (
    <Section title="Page Header" aside="36 byte + FSEG Header 20 byte">
      <FieldTable
        rows={[
          ['PAGE_N_DIR_SLOTS', header.nDirSlots, '페이지 디렉터리 슬롯 수'],
          ['PAGE_HEAP_TOP', header.heapTop, '레코드가 쌓인 끝. 여기부터 빈 공간'],
          [
            'PAGE_N_HEAP',
            <>
              {header.nHeap}
              <span className="ibd-dim"> (맨 위 비트 {header.compact ? '1 = COMPACT 형식' : '0 = REDUNDANT 형식'})</span>
            </>,
            '지금까지 자리를 받은 레코드 수. infimum · supremum 포함',
          ],
          ['PAGE_FREE', header.free || <span key="value" className="ibd-dim">0 (없음)</span>, '다시 쓸 수 있는 레코드 자리 목록의 첫 레코드'],
          ['PAGE_GARBAGE', `${header.garbage} byte`, '그 목록이 차지한 byte'],
          ['PAGE_LAST_INSERT', header.lastInsert || <span key="value" className="ibd-dim">0</span>, '마지막으로 삽입한 레코드'],
          ['PAGE_DIRECTION', DIRECTIONS[header.direction] ?? header.direction, '연속 삽입이 향하는 방향'],
          ['PAGE_N_DIRECTION', header.nDirection, '같은 방향으로 연속 삽입한 횟수'],
          ['PAGE_N_RECS', header.nRecs, '사용자 레코드 수. infimum · supremum 제외'],
          ['PAGE_MAX_TRX_ID', header.maxTrxId.toString(), '세컨더리 인덱스 리프에서만 쓴다'],
          ['PAGE_LEVEL', header.level, header.level === 0 ? '리프' : '논리프. 리프에서 몇 층 위인지'],
          [
            'PAGE_INDEX_ID',
            <>
              {header.indexId === 0xffffffffffffffffn ? '2⁶⁴−1' : header.indexId.toString()}
              {index && <span className="ibd-dim"> → {index.name}</span>}
            </>,
            '이 페이지가 속한 인덱스',
          ],
          ['PAGE_BTR_SEG_LEAF', fseg(header.segLeaf, space, onSelect), '리프 세그먼트의 INODE 엔트리 위치'],
          ['PAGE_BTR_SEG_TOP', fseg(header.segTop, space, onSelect), '논리프 세그먼트의 INODE 엔트리 위치'],
        ]}
      />
    </Section>
  );

  if (!header.compact) {
    return (
      <>
        {headerTable}
        <p className="ibd-note">REDUNDANT 형식 레코드는 아직 해석하지 않는다.</p>
      </>
    );
  }

  const chain = walkRecords(page, header);
  const free = freeRecords(page, header);
  const slots = directorySlots(page, header);
  const dirStart = directoryStart(page.length, header);
  const slotOf = new Map(slots.map((origin, i) => [origin, i]));

  return (
    <>
      <Section title="페이지 안의 배치" aside={<DocRef chapter="page">페이지 내부 구조</DocRef>}>
        <PageBytes
          pageSize={page.length}
          regions={regionsOf(page.length, header.heapTop, dirStart)}
          live={chain.records}
          free={free.records}
          picked={picked}
          onPick={setPicked}
        />
      </Section>

      {headerTable}

      <Section
        title={`레코드 ${chain.records.length}개`}
        aside={<DocRef chapter="record">레코드 내부 구조</DocRef>}
      >
        <p className="ibd-note">
          infimum 에서 <code>next_record</code> 를 따라간 키 순서다. 레코드 헤더 5 byte 만 읽었고, 컬럼 값은 아직
          풀지 않는다. 행을 누르면 위 그림에서 위치를 표시한다.
        </p>
        {chain.broken && <p className="ibd-warn">레코드 체인이 끊겼다: {chain.broken}</p>}
        <div className="ibd-scroll ibd-scroll--tall">
          <table className="ibd-table ibd-table--records">
            <thead>
              <tr>
                <th>#</th>
                <th>origin</th>
                <th>heap_no</th>
                <th>record_type</th>
                <th>delete_mask</th>
                <th>min_rec_mask</th>
                <th>n_owned</th>
                <th>next_record</th>
              </tr>
            </thead>
            <tbody>
              {chain.records.map((record, i) => (
                <tr
                  key={record.origin}
                  className={`ibd-table__click ${record.origin === picked ? 'ibd-table__row--picked' : ''} ${record.deleted ? 'ibd-table__row--deleted' : ''}`}
                  onClick={() => setPicked(record.origin)}
                >
                  <td>{i}</td>
                  <td>{record.origin}</td>
                  <td>{record.heapNo}</td>
                  <td>{STATUS_LABEL[record.status]}</td>
                  <td>{record.deleted ? 1 : 0}</td>
                  <td>{record.minRec ? 1 : 0}</td>
                  <td>
                    {record.nOwned || ''}
                    {slotOf.has(record.origin) && <span className="ibd-dim"> 슬롯 {slotOf.get(record.origin)}</span>}
                  </td>
                  <td>{record.next || <span className="ibd-dim">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={`PAGE_FREE 목록 ${free.records.length}개`}>
        {free.records.length === 0 ? (
          <p className="ibd-note">다시 쓸 수 있는 레코드 자리가 없다.</p>
        ) : (
          <>
            <p className="ibd-note">
              키 순서 체인에서 빠졌지만 바이트는 그대로 남아 있는 레코드 자리다. 삭제 후 purge 된 레코드, 페이지
              분할 때 다른 페이지로 옮겨 간 레코드가 여기에 남는다. 새 레코드가 크기가 맞으면 이 자리를 다시 쓴다.
              합계 <code>PAGE_GARBAGE</code> = {header.garbage} byte.
            </p>
            {free.broken && <p className="ibd-warn">목록이 끊겼다: {free.broken}</p>}
            <div className="ibd-pages">
              {free.records.map((record) => (
                <button
                  key={record.origin}
                  type="button"
                  className={`ibd-pagelink ${record.origin === picked ? 'ibd-pagelink--picked' : ''}`}
                  onClick={() => setPicked(record.origin)}
                >
                  {record.origin}
                  <span className="ibd-dim"> heap {record.heapNo}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section title={`페이지 디렉터리 슬롯 ${slots.length}개`}>
        <p className="ibd-note">
          페이지 끝에서 앞쪽으로 2 byte 씩, 레코드 몇 개마다 하나씩 그 묶음의 마지막 레코드 위치를 적는다. 검색은 이
          슬롯으로 이진 탐색한 뒤 <code>next_record</code> 로 몇 칸만 따라간다.
        </p>
        <div className="ibd-pages">
          {slots.map((origin, i) => (
            <button
              key={i}
              type="button"
              className={`ibd-pagelink ${origin === picked ? 'ibd-pagelink--picked' : ''}`}
              onClick={() => setPicked(origin)}
            >
              <span className="ibd-dim">{i} →</span> {origin}
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}

const BYTE_COLS = 128;

/** The page's bytes as a 128-wide grid: each cell one byte, coloured by the area it belongs to. */
function PageBytes({
  pageSize,
  regions,
  live,
  free,
  picked,
  onPick,
}: {
  pageSize: number;
  regions: Region[];
  live: RecordHeader[];
  free: RecordHeader[];
  picked: number | null;
  onPick: (origin: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const cell = pageSize > 16384 ? 2 : 3;
  const rows = pageSize / BYTE_COLS;
  const width = BYTE_COLS * cell;
  const height = rows * cell;

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = width * ratio;
    element.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);

    const paintRange = (from: number, to: number, color: string) => {
      context.fillStyle = color;
      for (let offset = from; offset < to; ) {
        const row = Math.floor(offset / BYTE_COLS);
        const col = offset % BYTE_COLS;
        const run = Math.min(to - offset, BYTE_COLS - col);
        context.fillRect(col * cell, row * cell, run * cell, cell);
        offset += run;
      }
    };
    for (const region of regions) if (region.to > region.from) paintRange(region.from, region.to, region.color);

    // The 5-byte header right before each origin, so records show up as separate marks.
    const mark = (record: RecordHeader, color: string) => paintRange(record.origin - 5, record.origin, color);
    for (const record of free) mark(record, MARK_FREE);
    for (const record of live) mark(record, record.deleted ? MARK_DELETED : MARK_LIVE);

    if (picked !== null) {
      const row = Math.floor((picked - 5) / BYTE_COLS);
      const col = (picked - 5) % BYTE_COLS;
      context.strokeStyle = '#1b2432';
      context.lineWidth = 2;
      context.strokeRect(col * cell - 3, row * cell - 3, Math.min(5, BYTE_COLS - col) * cell + 6, cell + 6);
    }
  }, [width, height, cell, regions, live, free, picked]);

  const offsetAt = (event: MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const col = Math.floor((event.clientX - rect.left) / cell);
    const row = Math.floor((event.clientY - rect.top) / cell);
    if (col < 0 || col >= BYTE_COLS || row < 0 || row >= rows) return null;
    return row * BYTE_COLS + col;
  };

  const hoverRegion = hover === null ? null : regions.find((r) => hover >= r.from && hover < r.to);
  // A click inside a record's header picks that record.
  const recordAt = (offset: number) =>
    [...live, ...free].find((record) => offset >= record.origin - 5 && offset < record.origin);

  return (
    <div className="ibd-bytes">
      <canvas
        ref={canvas}
        style={{ width, height }}
        onMouseMove={(event) => setHover(offsetAt(event))}
        onMouseLeave={() => setHover(null)}
        onClick={(event) => {
          const offset = offsetAt(event);
          const record = offset === null ? null : recordAt(offset);
          if (record) onPick(record.origin);
        }}
      />
      <div className="ibd-bytes__side">
        <p className="ibd-bytes__hover">
          {hover === null ? (
            <span className="ibd-dim">칸 하나가 1 byte 다. 마우스를 올리면 위치를 보여 준다.</span>
          ) : (
            <>
              오프셋 <b>{hover}</b> · {hoverRegion?.label}
              {recordAt(hover) && <> · 레코드 헤더 (origin {recordAt(hover)!.origin})</>}
            </>
          )}
        </p>
        <ul className="ibd-legend ibd-legend--column">
          {regions.map((region) => (
            <li key={region.label}>
              <i style={{ background: region.color }} className={region.color === '#ffffff' ? 'ibd-legend__hollow' : ''} />
              {region.label}
              <span className="ibd-dim">{region.to - region.from} byte</span>
            </li>
          ))}
          <li>
            <i style={{ background: MARK_LIVE }} />
            레코드 헤더 (5 byte)
          </li>
          {live.some((record) => record.deleted) && (
            <li>
              <i style={{ background: MARK_DELETED }} />
              delete_mask = 1 인 레코드 헤더
            </li>
          )}
          {free.length > 0 && (
            <li>
              <i style={{ background: MARK_FREE }} />
              PAGE_FREE 목록의 레코드 헤더
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

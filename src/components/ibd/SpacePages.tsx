import type { IbdSpace } from '../../ibd/analyze';
import type { ListBase } from '../../ibd/bytes';
import { pagesPerExtent, parseFspHeader, parseXdesPage, XDES_ARRAY_OFFSET, type XdesState } from '../../ibd/fsp';
import { parseInodePage } from '../../ibd/inode';
import { bytesLabel, hex, segmentLabel } from './format';
import { FieldTable, PageLink, Section } from './parts';

type Select = (pageNo: number) => void;

const XDES_STATE_NOTE: Record<XdesState, string> = {
  NOT_INITED: '아직 초기화되지 않음',
  FREE: '통째로 비어 있음',
  FREE_FRAG: '페이지 단위로 나눠 주는 중, 빈 페이지 있음',
  FULL_FRAG: '페이지 단위로 나눠 주는 중, 꽉 참',
  FSEG: '한 세그먼트가 통째로 소유',
  FSEG_FRAG: '한 세그먼트가 통째로 소유 (조각 할당 중)',
};

function ListValue({ list, space, xdes }: { list: ListBase; space: IbdSpace; xdes?: boolean }) {
  if (list.length === 0 || !list.first) return <span className="ibd-dim">비어 있음</span>;
  // An extent list points at the list node inside an XDES entry; turn that back into an extent number.
  const entrySize = 24 + pagesPerExtent(space.pageSize) / 4;
  const extent = Math.floor((list.first.offset - 8 - XDES_ARRAY_OFFSET) / entrySize);
  return (
    <span>
      {list.length}개 · 첫 항목{' '}
      {xdes ? `익스텐트 ${list.first.page / space.extentPages + extent}` : `페이지 ${list.first.page}`}
    </span>
  );
}

export function FspDetail({ space, page }: { space: IbdSpace; page: Uint8Array }) {
  const fsp = parseFspHeader(page);
  const flags = fsp.flags;
  const flagNames = [
    flags.postAntelope && 'POST_ANTELOPE',
    flags.zipSsize !== 0 && `ZIP_SSIZE=${flags.zipSsize}`,
    flags.atomicBlobs && 'ATOMIC_BLOBS',
    flags.pageSsize !== 0 && `PAGE_SSIZE=${flags.pageSsize}`,
    flags.dataDir && 'DATA_DIR',
    flags.shared && 'SHARED',
    flags.temporary && 'TEMPORARY',
    flags.encrypted && 'ENCRYPTION',
    flags.sdi && 'SDI',
  ].filter(Boolean);
  return (
    <Section title="FSP Header" aside="112 byte · 파일 전체의 공간 관리 정보">
      <FieldTable
        rows={[
          ['FSP_SPACE_ID', fsp.spaceId, '이 테이블스페이스의 ID'],
          ['FSP_SIZE', `${fsp.size} 페이지 (${bytesLabel(fsp.size * space.pageSize)})`, '파일 크기'],
          ['FSP_FREE_LIMIT', fsp.freeLimit, '이 번호 앞까지만 익스텐트로 초기화됐다'],
          [
            'FSP_SPACE_FLAGS',
            <>
              {hex(flags.raw, 4)}
              <br />
              <span className="ibd-dim">{flagNames.join(' · ')}</span>
            </>,
            `페이지 ${flags.logicalPageSize / 1024}KB${flags.zipSsize ? ` · 압축 페이지 ${flags.physicalPageSize / 1024}KB` : ''}`,
          ],
          ['FSP_FRAG_N_USED', fsp.fragNUsed, 'FREE_FRAG 익스텐트에서 쓰고 있는 페이지 수'],
          ['FSP_FREE', <ListValue key="value" list={fsp.free} space={space} xdes />, '통째로 비어 있는 익스텐트'],
          ['FSP_FREE_FRAG', <ListValue key="value" list={fsp.freeFrag} space={space} xdes />, '페이지 단위로 나눠 주는 중이고 빈 페이지가 남은 익스텐트'],
          ['FSP_FULL_FRAG', <ListValue key="value" list={fsp.fullFrag} space={space} xdes />, '페이지 단위로 나눠 주다가 꽉 찬 익스텐트'],
          ['FSP_SEG_ID', fsp.nextSegId.toString(), '다음에 만들 세그먼트가 받을 ID'],
          ['FSP_SEG_INODES_FULL', <ListValue key="value" list={fsp.inodesFull} space={space} />, '빈 슬롯이 없는 INODE 페이지'],
          ['FSP_SEG_INODES_FREE', <ListValue key="value" list={fsp.inodesFree} space={space} />, '빈 슬롯이 남은 INODE 페이지'],
        ]}
      />
    </Section>
  );
}

export function XdesTable({
  space,
  pageNo,
  page,
  onSelect,
}: {
  space: IbdSpace;
  pageNo: number;
  page: Uint8Array;
  onSelect: Select;
}) {
  const entries = parseXdesPage(page, pageNo, space.pageSize);
  const shown = entries.filter((entry) => entry.state !== 'NOT_INITED');
  return (
    <Section title="XDES 엔트리" aside={`익스텐트 하나당 ${24 + space.extentPages / 4} byte`}>
      <p className="ibd-note">
        익스텐트마다 상태(<code>XDES_STATE</code>), 소유 세그먼트(<code>XDES_ID</code>), 페이지별 빈 칸 비트(
        <code>XDES_BITMAP</code>)를 적어 둔다. 행을 누르면 그 익스텐트의 첫 페이지로 간다.
      </p>
      <div className="ibd-scroll">
        <table className="ibd-table">
          <thead>
            <tr>
              <th>익스텐트</th>
              <th>페이지</th>
              <th>XDES_STATE</th>
              <th>XDES_ID</th>
              <th>XDES_BITMAP (칠한 칸 = 사용 중)</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((entry) => (
              <tr key={entry.extent} className="ibd-table__click" onClick={() => onSelect(entry.firstPage)}>
                <td>{entry.extent}</td>
                <td>
                  {entry.firstPage}~{entry.firstPage + space.extentPages - 1}
                </td>
                <td title={XDES_STATE_NOTE[entry.state]}>
                  <code>{entry.state}</code>
                </td>
                <td>{entry.segId === 0n ? <span className="ibd-dim">—</span> : segmentLabel(space, entry.segId)}</td>
                <td>
                  <span className="ibd-bits">
                    {entry.free.map((free, i) => (
                      <i key={i} className={free ? '' : 'ibd-bits--used'} />
                    ))}
                  </span>
                  <span className="ibd-dim"> {entry.free.filter((free) => !free).length}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length < entries.length && (
        <p className="ibd-note">
          나머지 {entries.length - shown.length}개 엔트리는 FSP_FREE_LIMIT 너머라 아직 0 으로 비어 있다.
        </p>
      )}
    </Section>
  );
}

export function InodeDetail({ space, page, onSelect }: { space: IbdSpace; page: Uint8Array; onSelect: Select }) {
  const entries = parseInodePage(page, space.pageSize);
  const fragSlots = space.extentPages / 2;
  return (
    <Section title="INODE 엔트리" aside={`세그먼트 하나당 ${64 + fragSlots * 4} byte`}>
      <p className="ibd-note">
        인덱스 하나는 세그먼트 둘(논리프 · 리프)을 가진다. 세그먼트는 처음에 페이지를 하나씩 받아{' '}
        <code>FSEG_FRAG_ARR</code> 의 {fragSlots}칸에 적고, 그 칸이 다 차면 익스텐트를 통째로 받아{' '}
        <code>FSEG_FREE</code> · <code>FSEG_NOT_FULL</code> · <code>FSEG_FULL</code> 목록에 넣는다.
      </p>
      <div className="ibd-segs">
        {entries.map((entry) => {
          const extents = space.segments.find((segment) => segment.segId === entry.segId)?.extents ?? [];
          return (
            <div key={entry.offset} className="ibd-seg">
              <div className="ibd-seg__head">
                <b>{segmentLabel(space, entry.segId)}</b>
                <span className="ibd-dim">
                  FSEG_ID {entry.segId.toString()} · 오프셋 {entry.offset}
                  {!entry.magicOk && ' · FSEG_MAGIC_N 불일치'}
                </span>
              </div>
              <div className="ibd-seg__row">
                <code>FSEG_FRAG_ARR</code>
                <span className="ibd-dim">
                  {entry.fragPages.length}/{fragSlots}칸
                </span>
                <span className="ibd-pages">
                  {entry.fragPages.map((pageNo) => (
                    <PageLink key={pageNo} pageNo={pageNo} onSelect={onSelect} />
                  ))}
                </span>
              </div>
              <div className="ibd-seg__row">
                <code>FSEG_FREE · NOT_FULL · FULL</code>
                <span>
                  {entry.free.length} · {entry.notFull.length} · {entry.full.length} 익스텐트
                  {entry.notFull.length > 0 && (
                    <span className="ibd-dim"> (NOT_FULL 에서 {entry.notFullUsed} 페이지 사용 중)</span>
                  )}
                </span>
                {extents.length > 0 && (
                  <span className="ibd-pages">
                    {extents.map((extent) => (
                      <button
                        key={extent}
                        type="button"
                        className="ibd-pagelink"
                        onClick={() => onSelect(extent * space.extentPages)}
                      >
                        익스텐트 {extent}
                      </button>
                    ))}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

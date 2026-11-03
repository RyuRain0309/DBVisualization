import { useEffect, useState } from 'react';
import { readPage, type IbdSpace } from '../../ibd/analyze';
import { FIL_NULL } from '../../ibd/bytes';
import { checkPage } from '../../ibd/checksum';
import { parseFilHeader, parseFilTrailer } from '../../ibd/fil';
import {
  FIL_PAGE_INODE,
  FIL_PAGE_TYPE_FSP_HDR,
  FIL_PAGE_TYPE_XDES,
  isIndexLike,
  pageType,
} from '../../ibd/pageTypes';
import { IndexPageDetail } from './IndexPageDetail';
import { FspDetail, InodeDetail, XdesTable } from './SpacePages';
import { hex } from './format';
import { DocRef, FieldTable, PageLink, Section, type FieldRow } from './parts';

const ALLOCATION_NOTE = {
  free: 'XDES 에서 빈 페이지로 표시돼 있다. 예전에 쓰던 내용이 그대로 남아 있을 수 있다.',
  uninit: 'FSP_FREE_LIMIT 너머라 아직 익스텐트로 초기화되지 않은 공간이다.',
} as const;

export function PageDetail({
  space,
  pageNo,
  onSelect,
}: {
  space: IbdSpace;
  pageNo: number;
  onSelect: (pageNo: number) => void;
}) {
  const [loaded, setLoaded] = useState<{ pageNo: number; bytes: Uint8Array } | null>(null);

  useEffect(() => {
    let current = true;
    readPage(space, pageNo).then((bytes) => {
      if (current) setLoaded({ pageNo, bytes });
    });
    return () => {
      current = false;
    };
  }, [space, pageNo]);

  const summary = space.pages[pageNo]!;
  const type = pageType(summary.type);
  const allocation = space.allocation[pageNo]!;
  const owner = space.owners[pageNo];
  const ownerIndex = owner ? space.indexes[owner.index] : null;
  const page = loaded?.pageNo === pageNo ? loaded.bytes : null;

  return (
    <div className="ibd-detail">
      <header className="ibd-detail__head">
        <div className="ibd-detail__title">
          <h2>페이지 {pageNo}</h2>
          <code>{type.name}</code>
        </div>
        <p>{type.gloss}</p>
        <div className="ibd-detail__tags">
          {ownerIndex && (
            <span className="badge">
              {ownerIndex.name} · {owner!.segment === 'leaf' ? '리프' : '논리프'} 세그먼트
            </span>
          )}
          {summary.level >= 0 && <span className="badge">PAGE_LEVEL {summary.level}</span>}
          {allocation !== 'used' && <span className="badge badge--wait">{allocation === 'free' ? '빈 페이지' : '초기화 전'}</span>}
        </div>
        <div className="ibd-detail__nav">
          <button type="button" className="button" disabled={pageNo === 0} onClick={() => onSelect(pageNo - 1)}>
            ← {pageNo - 1}
          </button>
          <button
            type="button"
            className="button"
            disabled={pageNo >= space.pageCount - 1}
            onClick={() => onSelect(pageNo + 1)}
          >
            {pageNo + 1} →
          </button>
        </div>
      </header>

      {allocation !== 'used' && <p className="ibd-note">{ALLOCATION_NOTE[allocation]}</p>}

      {!page ? (
        <p className="ibd-note">페이지를 읽는 중…</p>
      ) : (
        <PageBody space={space} pageNo={pageNo} page={page} onSelect={onSelect} />
      )}
    </div>
  );
}

function PageBody({
  space,
  pageNo,
  page,
  onSelect,
}: {
  space: IbdSpace;
  pageNo: number;
  page: Uint8Array;
  onSelect: (pageNo: number) => void;
}) {
  const fil = parseFilHeader(page);
  const trailer = parseFilTrailer(page);
  const check = checkPage(page);
  const readable = space.unsupported.every((reason) => reason === 'redundant');

  // Only B+tree pages link to neighbours; other types leave whatever value they were created with.
  const sibling = (value: number) =>
    isIndexLike(fil.type) ? (
      <PageLink key="value" pageNo={value} onSelect={onSelect} />
    ) : (
      <span key="value" className="ibd-dim">
        {value === FIL_NULL ? 'FIL_NULL' : value} (이 페이지 종류는 쓰지 않음)
      </span>
    );

  if (check.empty) {
    return <p className="ibd-note">모든 byte 가 0 이다. 파일을 늘릴 때 자리만 잡혔고 한 번도 쓰인 적이 없다.</p>;
  }

  return (
    <>
      <Section title={readable ? 'FIL Header · FIL Trailer' : 'FIL Header'} aside={<DocRef chapter="page">페이지 내부 구조</DocRef>}>
        <FieldTable
          rows={[
            [
              'FIL_PAGE_SPACE_OR_CHKSUM',
              <>
                {hex(fil.checksum)}{' '}
                {readable && (
                  <span className={check.checksumOk ? 'ibd-ok' : 'ibd-bad'}>
                    {check.checksumOk ? '✓ crc32 일치' : `✗ 계산값 ${hex(check.computed)}`}
                  </span>
                )}
              </>,
              '체크섬. 읽을 때 다시 계산해 비교하고, 다르면 손상된 페이지로 본다',
            ],
            [
              'FIL_PAGE_OFFSET',
              <>
                {fil.pageNo}
                {fil.pageNo !== pageNo && <span className="ibd-bad"> ✗ 위치는 {pageNo}</span>}
              </>,
              '이 페이지의 번호. 파일 안 위치 ÷ 페이지 크기와 같아야 한다',
            ],
            ['FIL_PAGE_PREV', sibling(fil.prev), '같은 레벨의 왼쪽 페이지'],
            ['FIL_PAGE_NEXT', sibling(fil.next), '같은 레벨의 오른쪽 페이지'],
            ['FIL_PAGE_LSN', fil.lsn.toString(), '이 페이지에 마지막으로 반영된 변경의 LSN'],
            ['FIL_PAGE_TYPE', `${fil.type} (${pageType(fil.type).name})`, '페이지 종류'],
            ['FIL_PAGE_FILE_FLUSH_LSN', fil.flushLsn.toString(), '시스템 테이블스페이스 0번 페이지에서만 쓴다'],
            ['FIL_PAGE_SPACE_ID', fil.spaceId, '이 페이지가 속한 테이블스페이스'],
            // Compressed pages have no trailer and checksum a different byte range.
            ...(readable
              ? ([
                  ['(Trailer) 옛 체크섬', hex(trailer.oldChecksum), 'crc32 방식에서는 헤더의 체크섬과 같은 값'],
                  [
                    '(Trailer) LSN 하위 4 byte',
                    <span key="value">
                      {hex(trailer.lsnLow32)}{' '}
                      <span className={check.lsnOk ? 'ibd-ok' : 'ibd-bad'}>
                        {check.lsnOk ? '✓ FIL_PAGE_LSN 과 일치' : '✗ 헤더와 다름'}
                      </span>
                    </span>,
                    '페이지를 쓰다 중간에 끊기면 헤더와 달라져서 알아챌 수 있다',
                  ],
                ] satisfies FieldRow[])
              : []),
          ]}
        />
      </Section>

      {!readable ? (
        <p className="ibd-note">압축되었거나 암호화된 파일이라 이 아래 본문은 해석하지 않는다.</p>
      ) : fil.type === FIL_PAGE_TYPE_FSP_HDR ? (
        <>
          <FspDetail space={space} page={page} />
          <XdesTable space={space} pageNo={pageNo} page={page} onSelect={onSelect} />
        </>
      ) : fil.type === FIL_PAGE_TYPE_XDES ? (
        <XdesTable space={space} pageNo={pageNo} page={page} onSelect={onSelect} />
      ) : fil.type === FIL_PAGE_INODE ? (
        <InodeDetail space={space} page={page} onSelect={onSelect} />
      ) : isIndexLike(fil.type) ? (
        <IndexPageDetail key={pageNo} space={space} page={page} onSelect={onSelect} />
      ) : (
        <p className="ibd-note">이 페이지 종류의 본문은 아직 해석하지 않는다.</p>
      )}
    </>
  );
}

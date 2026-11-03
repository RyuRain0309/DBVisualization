import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { analyze, IbdError, type IbdSpace } from '../../ibd/analyze';
import { pageType } from '../../ibd/pageTypes';
import { blobSource, bytesSource, gunzipIfNeeded, type IbdSource } from '../../ibd/source';
import { useRoute } from '../../router';
import { AppMark } from '../onboarding/AppMark';
import { PageDetail } from './PageDetail';
import { PageMap } from './PageMap';
import { legendFor, MAP_MODES, paintAll, type MapMode } from './paint';
import { bytesLabel, mysqlVersion } from './format';
import { DocRef } from './parts';

type Load =
  | { status: 'idle' }
  | { status: 'loading'; name: string; done: number; total: number }
  | { status: 'error'; message: string }
  | { status: 'ready'; space: IbdSpace };

const SAMPLE_URL = `${import.meta.env.BASE_URL}samples/users.ibd.gz`;

export function IbdView() {
  const [, navigate] = useRoute();
  const [load, setLoad] = useState<Load>({ status: 'idle' });
  const abort = useRef<AbortController | null>(null);

  async function open(source: Promise<IbdSource>, name: string) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoad({ status: 'loading', name, done: 0, total: 0 });
    try {
      const space = await analyze(
        await source,
        (done, total) => {
          if (!controller.signal.aborted) setLoad({ status: 'loading', name, done, total });
        },
        controller.signal,
      );
      if (!controller.signal.aborted) setLoad({ status: 'ready', space });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message =
        error instanceof IbdError
          ? error.message
          : `파일을 읽다가 문제가 생겼다: ${error instanceof Error ? error.message : String(error)}`;
      setLoad({ status: 'error', message });
    }
  }

  const openFile = (file: File) => open(Promise.resolve(blobSource(file, file.name)), file.name);

  const openSample = () =>
    open(
      (async () => {
        const response = await fetch(SAMPLE_URL);
        if (!response.ok) throw new Error(`예제 파일을 받지 못했다 (HTTP ${response.status})`);
        const bytes = await gunzipIfNeeded(new Uint8Array(await response.arrayBuffer()));
        return bytesSource(bytes, 'users.ibd (예제)');
      })(),
      'users.ibd (예제)',
    );

  return (
    <div className="ibd">
      <header className="docs__bar">
        <button type="button" className="button" onClick={() => navigate({ view: 'welcome', param: null })}>
          ← 처음으로
        </button>
        <div className="docs__brand">
          <AppMark className="docs__mark" />
          <strong>파일 분석</strong>
          <span>.ibd 파일 안의 페이지를 그대로 펼쳐 본다</span>
        </div>
        {load.status === 'ready' || load.status === 'error' ? (
          <button type="button" className="button" onClick={() => setLoad({ status: 'idle' })}>
            다른 파일 열기
          </button>
        ) : (
          <span />
        )}
      </header>

      {load.status === 'idle' && <OpenPanel onFile={openFile} onSample={openSample} />}
      {load.status === 'loading' && <Progress name={load.name} done={load.done} total={load.total} />}
      {load.status === 'error' && (
        <div className="ibd-center">
          <div className="ibd-open">
            <h2>열지 못했다</h2>
            <p className="ibd-warn">{load.message}</p>
            <button type="button" className="button" onClick={() => setLoad({ status: 'idle' })}>
              다른 파일 열기
            </button>
          </div>
        </div>
      )}
      {load.status === 'ready' && <SpaceView space={load.space} />}
    </div>
  );
}

function OpenPanel({ onFile, onSample }: { onFile: (file: File) => void; onSample: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div className="ibd-center">
      <div className="ibd-open">
        <h2>.ibd 파일 열기</h2>
        <div
          className={`ibd-drop ${dragging ? 'ibd-drop--over' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <p>여기에 파일을 끌어다 놓거나</p>
          <button type="button" className="button button--primary" onClick={() => input.current?.click()}>
            파일 선택
          </button>
          <input
            ref={input}
            type="file"
            accept=".ibd"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
              event.target.value = '';
            }}
          />
        </div>
        <p className="ibd-open__privacy">
          파일은 이 브라우저 안에서만 읽는다. 서버로 보내지 않는다.
        </p>

        <div className="ibd-open__sample">
          <button type="button" className="button" onClick={onSample}>
            예제 파일로 보기
          </button>
          <span>
            <code>users</code> 테이블 · 10000행, 200행 삭제, 긴 TEXT 값 10개, 세컨더리 인덱스 1개
          </span>
        </div>

        <div className="ibd-open__how">
          <b>.ibd 파일 구하기</b>
          <ol>
            <li>MySQL 8.0 이상, 기본 설정(file-per-table)이면 데이터 디렉터리의 <code>DB이름/테이블이름.ibd</code> 가 그 파일이다.</li>
            <li>
              서버가 실행 중이면 아직 디스크에 쓰지 않은 변경이 버퍼 풀에 남아 있다. 먼저{' '}
              <code>FLUSH TABLES 테이블 FOR EXPORT;</code> 로 디스크에 내린 뒤 복사하고, 같은 세션에서{' '}
              <code>UNLOCK TABLES;</code> 를 실행한다.
            </li>
            <li>
              <code>ROW_FORMAT=COMPRESSED</code> 나 <code>ENCRYPTION='Y'</code> 테이블은 페이지 지도까지만 보여 준다.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function Progress({ name, done, total }: { name: string; done: number; total: number }) {
  return (
    <div className="ibd-center">
      <div className="ibd-open">
        <h2>{name}</h2>
        <p className="ibd-note">{total === 0 ? '파일을 여는 중…' : `페이지 헤더를 읽는 중 · ${done} / ${total}`}</p>
        <div className="ibd-progress">
          <i style={{ width: total === 0 ? '0%' : `${(done / total) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

const UNSUPPORTED_NOTE = {
  compressed: 'ROW_FORMAT=COMPRESSED 테이블이다. 페이지가 압축되어 있어 FIL 헤더로 페이지 종류만 보여 준다.',
  encrypted: '암호화된 테이블이다. 키 없이는 본문을 읽을 수 없어 FIL 헤더로 페이지 종류만 보여 준다.',
  redundant: 'REDUNDANT 형식 테이블이다. 레코드 해석은 지원하지 않는다.',
} as const;

const KIND_LABEL = { clustered: '클러스터드', secondary: '세컨더리', sdi: 'SDI', unknown: '알 수 없음' } as const;

function SpaceView({ space }: { space: IbdSpace }) {
  const [mode, setMode] = useState<MapMode>('type');
  const [selected, setSelected] = useState<number | null>(null);
  const paints = useMemo(() => paintAll(space, mode), [space, mode]);
  const legend = useMemo(() => legendFor(space, mode), [space, mode]);
  const table = space.sdi?.table;
  const side = useRef<HTMLElement>(null);

  // A newly picked page starts at its top, not wherever the previous one was scrolled to.
  useEffect(() => {
    side.current?.scrollTo({ top: 0 });
  }, [selected]);

  const tooltip = (pageNo: number) => {
    const page = space.pages[pageNo]!;
    const owner = space.owners[pageNo];
    const allocation = space.allocation[pageNo];
    return (
      <>
        <b>페이지 {pageNo}</b> <code>{pageType(page.type).name}</code>
        {owner && (
          <div>
            {space.indexes[owner.index]!.name} · {owner.segment === 'leaf' ? '리프' : '논리프'} 세그먼트
          </div>
        )}
        {page.level >= 0 && (
          <div>
            PAGE_LEVEL {page.level} · 레코드 {page.nRecs}개 · {Math.round(page.fill * 100)}% 사용
          </div>
        )}
        {allocation === 'free' && <div>XDES 상 빈 페이지</div>}
        {allocation === 'uninit' && <div>초기화 전 공간</div>}
      </>
    );
  };

  return (
    <div className="ibd-body">
      <div className="ibd-main">
        <section className="ibd-summary">
          <div className="ibd-summary__file">
            <h2>{space.source.name}</h2>
            <span>
              {bytesLabel(space.source.size)} · 페이지 {space.pageCount}개 × {space.pageSize / 1024}KB · 익스텐트{' '}
              {Math.ceil(space.pageCount / space.extentPages)}개
            </span>
          </div>
          {table && (
            <div className="ibd-summary__table">
              <b>
                {table.schema ? `${table.schema}.` : ''}
                {table.name}
              </b>
              <span>
                ROW_FORMAT={table.rowFormat} · MySQL {mysqlVersion(table.mysqlVersion)} · space ID {space.fsp.spaceId}
              </span>
              <span className="ibd-dim">
                {table.columns
                  .filter((column) => !column.hidden)
                  .map((column) => `${column.name} ${column.columnType}`)
                  .join(', ')}
              </span>
            </div>
          )}
          {space.unsupported.map((reason) => (
            <p key={reason} className="ibd-warn">
              {UNSUPPORTED_NOTE[reason]}
            </p>
          ))}
          {space.sdi?.errors.map((error) => (
            <p key={error} className="ibd-warn">
              {error}
            </p>
          ))}
          {space.pages.some((page) => page.misplaced) && (
            <p className="ibd-warn">
              FIL_PAGE_OFFSET 이 파일 안 위치와 다른 페이지가 있다. 파일이 잘렸거나 손상됐을 수 있다.
            </p>
          )}

          {space.indexes.length > 0 && (
            <div className="ibd-indexes">
              {space.indexes.map((index) => (
                <button key={index.root} type="button" className="ibd-index" onClick={() => setSelected(index.root)}>
                  <b>{index.name}</b>
                  <span>
                    {KIND_LABEL[index.kind]}
                    {index.columns.length > 0 && ` (${index.columns.join(', ')})`}
                  </span>
                  <em>
                    루트 {index.root} · 높이 {index.height} · 논리프 {index.nonLeaf?.pages.length ?? 0} · 리프{' '}
                    {index.leaf?.pages.length ?? 0} 페이지
                  </em>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="ibd-mapcard">
          <div className="ibd-mapcard__head">
            <div className="ibd-modes">
              {MAP_MODES.map((one) => (
                <button
                  key={one.id}
                  type="button"
                  className={`chip ${mode === one.id ? 'chip--active' : ''}`}
                  onClick={() => setMode(one.id)}
                >
                  {one.label}
                </button>
              ))}
            </div>
            <span className="ibd-dim">
              한 줄 = 64 페이지{space.extentPages === 64 ? ' = 익스텐트 하나' : ''} ·{' '}
              <DocRef chapter="segment">세그먼트 · 익스텐트</DocRef>
            </span>
          </div>
          <PageMap
            pageCount={space.pageCount}
            extentPages={space.extentPages}
            paints={paints}
            selected={selected}
            onSelect={setSelected}
            tooltip={tooltip}
          />
          <ul className="ibd-legend">
            {legend.map((item) => (
              <li key={item.label}>
                <i
                  style={{ background: item.paint.fill, borderColor: item.paint.stroke }}
                  className={item.paint.stroke ? 'ibd-legend__hollow' : ''}
                >
                  {item.paint.mark && <s style={{ background: item.paint.mark }} />}
                </i>
                {item.label}
                <span className="ibd-dim">{item.count}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="ibd-side" ref={side}>
        {selected === null ? (
          <div className="ibd-detail ibd-detail--empty">
            <p>지도에서 페이지를 누르면 그 페이지의 헤더와 내용을 여기에 보여 준다.</p>
            <p className="ibd-dim">
              0번 FSP_HDR, 2번 INODE, 인덱스의 루트 페이지부터 보면 파일 구조를 따라가기 쉽다.
            </p>
          </div>
        ) : (
          <PageDetail space={space} pageNo={selected} onSelect={setSelected} />
        )}
      </aside>
    </div>
  );
}

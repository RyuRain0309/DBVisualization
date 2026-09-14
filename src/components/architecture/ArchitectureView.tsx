import type { EngineSnapshot } from '../../engine/executor/events';
import { useEngineStore } from '../../store/engineStore';

/**
 * The layout follows the InnoDB architecture diagram in the MySQL 8.0 manual
 * (dev.mysql.com/doc/refman/8.0/en/innodb-architecture.html): in-memory structures on one
 * side, on-disk structures on the other. Boxes this simulator does not model are marked as
 * such instead of being quietly left out.
 */
export function ArchitectureView({ snapshot }: { snapshot: EngineSnapshot }) {
  const checkpoint = useEngineStore((state) => state.checkpoint);
  const pool = snapshot.bufferPool;
  const pendingRedo = snapshot.redo.records.filter(
    (record) => record.lsn > snapshot.redo.flushedUpToLsn,
  );
  const durableRedo = snapshot.redo.records.length - pendingRedo.length;
  const undoByState = {
    active: snapshot.undo.filter((record) => record.state === 'active').length,
    retained: snapshot.undo.filter((record) => record.state === 'retained').length,
    purged: snapshot.undo.filter((record) => record.state === 'purged').length,
  };
  const hitRate = pool.reads === 0 ? 0 : Math.round((pool.hits / pool.reads) * 100);

  return (
    <div className="arch">
      <section className="arch__group arch__group--memory">
        <header>
          <h2>In-Memory Structures</h2>
          <p>서버 프로세스 안에 있는 것들. 여기서 일어난 변경은 아직 파일에 없다.</p>
        </header>

        <article className="arch__box arch__box--wide">
          <h3>
            Buffer Pool
            <span className="arch__badge">
              {pool.frames.length} / {pool.capacity} 페이지
            </span>
          </h3>
          <p>테이블스페이스의 페이지를 캐싱한다.</p>

          <div className="arch__stats">
            <span>
              더티 <strong>{pool.dirtyCount}</strong>
            </span>
            <span>
              히트율 <strong>{hitRate}%</strong>
            </span>
            <span>
              읽기 <strong>{pool.reads}</strong>
            </span>
            <span>
              축출 <strong>{pool.evictions}</strong>
            </span>
          </div>

          {pool.frames.length === 0 ? (
            <p className="arch__empty">아직 올라온 페이지가 없다.</p>
          ) : (
            <>
              <div className="frames">
                {pool.frames.map((frame) => (
                  <span
                    key={`${frame.indexId}-${frame.pageId}`}
                    className={`frame frame--${frame.sublist} ${frame.dirty ? 'frame--dirty' : ''}`}
                    title={`${frame.tableName}.${frame.indexId} 페이지 ${frame.pageId} · ${
                      frame.dirty ? `더티 (LSN ${frame.lastLsn})` : '디스크와 동일'
                    } · ${frame.sublist} 영역 · 읽기 ${frame.reads}회`}
                  >
                    <em>{frame.indexId}</em>p{frame.pageId}
                  </span>
                ))}
              </div>
              <p className="arch__legend">
                왼쪽이 가장 최근에 쓴 페이지다. <span className="dot dot--young" /> young ·{' '}
                <span className="dot dot--old" /> old(새로 읽힌 것) ·{' '}
                <span className="dot dot--dirty" /> 더티(디스크와 다름)
              </p>
            </>
          )}

          <button type="button" className="button" onClick={checkpoint}>
            체크포인트 실행 — 더티 페이지 내려쓰기
          </button>
        </article>

        <article className="arch__box">
          <h3>
            Log Buffer
            <span className="arch__badge">{pendingRedo.length}건 대기</span>
          </h3>
          <p>redo 레코드를 모아 뒀다가 커밋 시점에 내려보낸다.</p>
          <div className="arch__stats">
            <span>
              마지막 LSN <strong>{snapshot.redo.records.at(-1)?.lsn ?? 0}</strong>
            </span>
          </div>
        </article>

        <article className="arch__box arch__box--muted">
          <h3>
            Change Buffer
            <span className="arch__badge arch__badge--muted">미모델링</span>
          </h3>
          <p>버퍼 풀에 없는 세컨더리 인덱스 페이지의 변경을 모아 둔다. 여기서는 항상 즉시 갱신한다.</p>
        </article>

        <article className="arch__box arch__box--muted">
          <h3>
            Adaptive Hash Index
            <span className="arch__badge arch__badge--muted">미모델링</span>
          </h3>
          <p>반복되는 탐색 경로를 해시로 대신한다. 여기서는 항상 루트부터 내려간다.</p>
        </article>
      </section>

      <section className="arch__group arch__group--disk">
        <header>
          <h2>On-Disk Structures</h2>
          <p>재시작해도 남는 것들. 체크포인트와 로그 flush 가 여기로 내려쓴다.</p>
        </header>

        <article className="arch__box arch__box--wide">
          <h3>Tablespaces</h3>

          <div className="arch__sub">
            <h4>File-Per-Table Tablespaces</h4>
            {snapshot.tables.length === 0 ? (
              <p className="arch__empty">아직 만든 테이블이 없다.</p>
            ) : (
              <ul className="arch__list">
                {snapshot.tables.map((table) => {
                  const pages = table.indexes.reduce(
                    (sum, index) => sum + index.tree.pages.length,
                    0,
                  );
                  return (
                    <li key={table.table.name}>
                      <code>{table.table.name}.ibd</code>
                      <span>
                        인덱스 {table.indexes.length}개 · 페이지 {pages}개
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="arch__hint">
              테이블마다 파일이 하나씩 생기고, 그 안에 클러스터드 인덱스와 세컨더리 인덱스가 함께 들어간다.
            </p>
          </div>

          <div className="arch__sub">
            <h4>Undo Tablespaces</h4>
            <ul className="arch__list">
              <li>
                <code>undo_001 · undo_002</code>
                <span>
                  활성 {undoByState.active} · 보관 {undoByState.retained} · purge {undoByState.purged}
                </span>
              </li>
            </ul>
            <p className="arch__hint">
              롤백과 MVCC 가 함께 쓰는 undo 로그가 여기 저장된다. 오래 열린 트랜잭션이 있으면 purge 가
              밀려 이 영역이 커진다.
            </p>
          </div>

          <div className="arch__sub arch__sub--muted">
            <h4>System Tablespace · General · Temporary Tablespaces</h4>
            <p className="arch__hint">
              <code>ibdata1</code> 은 데이터 딕셔너리(8.0 이전)와 change buffer 등을 담고,
              <code> ibtmp1</code> 은 임시 테이블용이다. 이 시뮬레이터는 테이블마다 파일이 하나씩 있는
              file-per-table 구성만 다룬다.
            </p>
          </div>
        </article>

        <article className="arch__box">
          <h3>
            Redo Log
            <span className="arch__badge">{durableRedo}건 durable</span>
          </h3>
          <p>페이지를 어떻게 바꿨는지. 장애 복구용이다.</p>
          <div className="arch__stats">
            <span>
              flush LSN <strong>{snapshot.redo.flushedUpToLsn}</strong>
            </span>
            <span>
              체크포인트 LSN <strong>{snapshot.checkpointLsn}</strong>
            </span>
          </div>
          <p className="arch__hint">
            체크포인트 LSN 보다 앞선 redo 는 이미 데이터 파일에 반영돼 복구에 필요 없다.
          </p>
        </article>

        <article className="arch__box">
          <h3>
            Doublewrite Buffer
            <span className="arch__badge">
              {snapshot.doublewrite.reduce((sum, batch) => sum + batch.pages.length, 0)} 페이지
            </span>
          </h3>
          <p>제자리에 쓰기 전 페이지를 통째로 복사해 둔다. 찢어진 쓰기를 이 사본으로 되살린다.</p>
          {snapshot.doublewrite.length > 0 && (
            <div className="arch__stats">
              <span>
                배치 <strong>{snapshot.doublewrite.length}</strong>
              </span>
              <span>
                마지막 LSN <strong>{snapshot.doublewrite.at(-1)?.lsn ?? 0}</strong>
              </span>
            </div>
          )}
        </article>
      </section>

      <section className="arch__group arch__group--files">
        <header>
          <h2>File Structures</h2>
          <p>위 구조들이 데이터 디렉터리에서 실제로 어떤 파일로 존재하는지 (MySQL 8.0 기준).</p>
        </header>

        <ul className="files">
          {snapshot.tables.map((table) => (
            <li key={table.table.name}>
              <code>{table.table.name}.ibd</code>
              <span>file-per-table 테이블스페이스 — 이 시뮬레이터가 실제로 다루는 부분</span>
            </li>
          ))}
          <li>
            <code>#innodb_redo/#ib_redo*</code>
            <span>redo 로그 파일 (8.0.30+; 이전 버전은 ib_logfile0, ib_logfile1)</span>
          </li>
          <li>
            <code>undo_001, undo_002</code>
            <span>undo 테이블스페이스</span>
          </li>
          <li>
            <code>#ib_16384_0.dblwr</code>
            <span>doublewrite 파일 (8.0.20+; 이전에는 시스템 테이블스페이스 안에 있었다)</span>
          </li>
          <li className="files__muted">
            <code>ibdata1</code>
            <span>시스템 테이블스페이스 — 미모델링</span>
          </li>
          <li className="files__muted">
            <code>ibtmp1</code>
            <span>임시 테이블스페이스 — 미모델링</span>
          </li>
        </ul>
      </section>
    </div>
  );
}

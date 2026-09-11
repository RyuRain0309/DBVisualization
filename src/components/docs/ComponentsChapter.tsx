import { Block, Figure, Note, Roles } from './parts';

/**
 * The map chapter: who does what. Everything else in the docs is a zoom into one of these boxes,
 * so the layout matches the app's 아키텍처 tab — memory on one side, disk on the other.
 */
export function ComponentsChapter() {
  return (
    <>
      <p className="doc-lead">
        MySQL 은 SQL 을 해석하는 서버 레이어와, 데이터를 실제로 보관하는 스토리지 엔진으로 나뉜다.
        InnoDB 는 후자다. 파싱과 실행 계획은 위에서 끝나고, InnoDB 는 <strong>행 단위로 읽고 쓰라</strong>는
        요청만 받는다.
      </p>

      <Figure caption="위에서 아래로 한 요청이 지나가는 층. 굵은 선 아래가 InnoDB 가 책임지는 범위다.">
        <div className="map">
          <div className="map__layer map__layer--server">
            <strong>SQL 레이어</strong>
            <span>커넥션 · 파서 · 옵티마이저 · 실행기</span>
          </div>
          <div className="map__seam">handler API — “id=20 인 행을 읽어라 / 이 값으로 바꿔라”</div>

          <div className="map__engine">
            <div className="map__side">
              <h4>인메모리</h4>
              <ul>
                <li>
                  <b>Buffer Pool</b>
                  <span>페이지 캐시. 읽기도 쓰기도 여기서 먼저 일어난다</span>
                </li>
                <li>
                  <b>Change Buffer</b>
                  <span>버퍼 풀에 없는 세컨더리 인덱스 페이지의 변경을 모아 둔다</span>
                </li>
                <li>
                  <b>Adaptive Hash Index</b>
                  <span>자주 쓰이는 탐색 경로를 해시로 질러간다</span>
                </li>
                <li>
                  <b>Log Buffer</b>
                  <span>아직 파일로 내려가지 않은 redo 레코드가 쌓인다</span>
                </li>
              </ul>
            </div>

            <div className="map__side map__side--disk">
              <h4>온디스크</h4>
              <ul>
                <li>
                  <b>테이블스페이스 (.ibd)</b>
                  <span>행과 인덱스가 실제로 사는 곳</span>
                </li>
                <li>
                  <b>Redo Log</b>
                  <span>“페이지를 이렇게 바꿨다”는 기록. 장애 복구용</span>
                </li>
                <li>
                  <b>Undo Tablespace</b>
                  <span>“바꾸기 전엔 이랬다”는 기록. 롤백과 MVCC 용</span>
                </li>
                <li>
                  <b>Doublewrite</b>
                  <span>페이지를 제자리에 쓰기 전 사본. 찢어진 쓰기 대비</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </Figure>

      <Block title="redo · undo · doublewrite 의 차이">
        <p>
          redo 와 undo 는 이름이 비슷하지만 방향이 반대고 손님도 다르다.
        </p>
        <Roles
          rows={[
            [
              'Redo',
              <>
                <b>앞으로</b> 다시 적용하는 기록. 커밋했는데 데이터 페이지가 아직 메모리에만 있을 때,
                재시작 후 그 변경을 되살린다. 페이지를 바꾸기 <b>전에</b> 먼저 쓰인다(WAL).
              </>,
            ],
            [
              'Undo',
              <>
                <b>되돌리는</b> 기록. ROLLBACK 이 이걸 거꾸로 적용하고, 다른 트랜잭션은 같은 기록을 따라가
                자기 시점의 <b>옛날 값</b>을 읽는다. MVCC 가 락 없이 읽을 수 있는 근거다.
              </>,
            ],
            [
              'Doublewrite',
              <>
                로그가 아니라 <b>사본</b>. redo 는 페이지가 온전하다는 가정 위에서 동작하므로, 16KB 를
                쓰다 4KB 만 쓰인 페이지는 redo 로 못 고친다. 그래서 원본을 먼저 딴 데 통째로 쓴다.
              </>,
            ],
          ]}
        />
      </Block>

      <Block title="변경이 처리되는 순서">
        <ol className="doc-steps">
          <li>
            <b>페이지 확보</b> — 대상 페이지가 버퍼 풀에 없으면 디스크에서 읽어 올린다.
          </li>
          <li>
            <b>락</b> — 바꿀 행(과 필요하면 그 앞 간격)에 락을 건다. 이미 남이 쥐고 있으면 대기한다.
          </li>
          <li>
            <b>undo 기록</b> — 바꾸기 전 값을 undo 에 남기고, 행의 롤백 포인터가 그 기록을 가리키게 한다.
          </li>
          <li>
            <b>페이지 변경 + redo</b> — 메모리의 페이지를 고쳐 더티로 만들고, 같은 변경을 redo 레코드로
            로그 버퍼에 붙인다. 순서는 항상 <b>로그가 먼저</b>다.
          </li>
          <li>
            <b>COMMIT</b> — 로그 버퍼를 redo 파일로 flush 한다. 이 시점에 데이터 파일은 아직 옛날 그대로다.
            그래도 복구할 수 있으니 커밋이 끝난다.
          </li>
          <li>
            <b>flush</b> — 나중에 체크포인트가 더티 페이지를 doublewrite 에 먼저 쓰고, 그다음 .ibd 제자리에
            쓴다.
          </li>
          <li>
            <b>purge</b> — 그 옛날 값을 더 볼 트랜잭션이 없어지면 백그라운드 스레드가 undo 를 지운다.
          </li>
        </ol>
        <Note>
          이 시뮬레이터는 4·5·6·7 단계를 단계별로 재생한다. change buffer 와 adaptive hash index 는 모델링하지 않아
          세컨더리 인덱스를 항상 즉시 갱신하고, 탐색은 늘 루트부터 내려간다.
        </Note>
      </Block>
    </>
  );
}

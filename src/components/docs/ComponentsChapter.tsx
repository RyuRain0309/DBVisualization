import { Block, Figure, Note, Roles } from './parts';

/**
 * The map chapter: who does what. The figure is stacked the way a request travels — server layer,
 * the handler API seam, then the engine — because the most common confusion is assuming the
 * parser and optimizer belong to InnoDB. Inside the engine the layout matches the app's
 * 아키텍처 tab: memory on one side, disk on the other.
 */
export function ComponentsChapter() {
  return (
    <>
      <p className="doc-lead">
        MySQL 은 두 계층이다. 위의 <strong>서버 레이어</strong>가 SQL 을 해석해 무엇을 읽을지 정하고,
        아래의 <strong>스토리지 엔진</strong>이 그 요청대로 데이터를 읽고 쓴다. InnoDB 는 아래쪽이다.
        둘 사이는 <code>handler</code> API 로만 이어져 있어서, 엔진은 SQL 문장을 아예 보지 못하고{' '}
        <strong>행 단위 요청</strong>만 받는다.
      </p>

      <Figure caption="한 요청이 위에서 아래로 지나가는 두 계층. 굵은 선 위는 엔진이 무엇이든 똑같이 돌고, 아래만 InnoDB 의 몫이다. 페이지는 버퍼 풀과 파일 사이를 양방향으로 오가지만, redo 는 나가기만 한다 — 복구 때 읽히더라도 로그 버퍼로 되돌아오지 않고 버퍼 풀의 페이지에 바로 적용된다.">
        <div className="map">
          <section className="map__layer">
            <header>
              <h4>서버 레이어</h4>
              <span>mysqld — 모든 스토리지 엔진이 공유한다</span>
            </header>
            <ul className="map__units">
              <li>
                <b>커넥션 핸들러</b>
                <span>접속과 스레드, 인증과 권한</span>
              </li>
              <li>
                <b>파서</b>
                <span>SQL 문자열을 파스 트리로</span>
              </li>
              <li>
                <b>옵티마이저</b>
                <span>통계를 보고 인덱스와 조인 순서를 고른다</span>
              </li>
              <li>
                <b>실행기</b>
                <span>계획을 따라가며 엔진을 호출한다</span>
              </li>
            </ul>
            <p className="map__aside">
              데이터 딕셔너리 · 바이너리 로그 · 복제도 이 층에 있다. 바이너리 로그는 redo 와 다른
              물건이다 — 복제와 시점 복구용이고, 엔진과 무관하게 서버가 남긴다.
            </p>
          </section>

          <div className="map__seam">
            <b>handler API</b>
            <span>
              <code>index_read</code> · <code>index_next</code> · <code>update_row</code> 같은 행
              단위 호출만 오간다. SQL 문자열은 이 선을 넘지 않는다
            </span>
          </div>

          <section className="map__layer map__layer--engine">
            <header>
              <h4>스토리지 엔진 레이어 — InnoDB</h4>
              <span>행을 실제로 읽고 쓰고, 락 · 트랜잭션 · 복구를 책임진다</span>
            </header>

            <div className="map__grid">
              <span className="map__col">In-Memory Structures</span>
              <span />
              <span className="map__col map__col--right">On-Disk Structures</span>

              <div className="map__cell map__cell--mem map__cell--tall">
                <b>Buffer Pool</b>
                <span>
                  데이터 · 인덱스 · undo 페이지를 모두 담는 캐시. 읽기도 쓰기도 여기서 먼저 일어난다
                </span>
              </div>
              <span className="map__flow map__flow--both" />
              <div className="map__cell map__cell--disk">
                <b>Tablespaces (.ibd)</b>
                <span>행과 인덱스가 실제로 사는 곳</span>
              </div>

              <span className="map__flow map__flow--both" />
              <div className="map__cell map__cell--disk">
                <b>Undo Tablespaces</b>
                <span>“바꾸기 전엔 이랬다”는 기록. 롤백과 MVCC 용</span>
              </div>

              <div className="map__cell map__cell--mem">
                <b>Log Buffer</b>
                <span>아직 파일로 내려가지 않은 redo 레코드가 쌓인다</span>
              </div>
              <span className="map__flow map__flow--out" />
              <div className="map__cell map__cell--disk">
                <b>Redo Log</b>
                <span>“페이지를 이렇게 바꿨다”는 기록. 장애 복구용</span>
              </div>

              <div className="map__cell map__cell--mem map__cell--solo">
                <b>Change Buffer</b>
                <span>
                  버퍼 풀에 없는 세컨더리 인덱스 페이지의 변경을 모아 뒀다가, 그 페이지를 읽을 때 합친다
                </span>
              </div>
              <span />
              <div className="map__cell map__cell--disk map__cell--solo">
                <b>Doublewrite</b>
                <span>더티 페이지를 제자리에 쓰기 전 여기 먼저 통째로 쓴다. 찢어진 쓰기 대비</span>
              </div>

              <div className="map__cell map__cell--mem map__cell--solo">
                <b>Adaptive Hash Index</b>
                <span>
                  자주 쓰이는 탐색 경로를 해시로 질러간다. 버퍼 풀에서 파생된 것이라 재시작하면 다시 만든다
                </span>
              </div>
              <span />
              <span />
            </div>
          </section>

          <p className="map__swap">
            같은 자리에 MyISAM · Memory 같은 다른 엔진을 끼울 수도 있다. 그러면 위 네 칸은 그대로고,
            트랜잭션 · 락 · 복구의 성질만 통째로 달라진다.
          </p>
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
        <p>
          그래서 undo 를 남기는 일 자체도 redo 에 기록된다. undo 레코드를 쓰면 undo 페이지가 바뀌고,
          그 페이지 변경이 다시 redo 레코드가 된다. 장애가 나도 undo 가 함께 복구돼야 미완 트랜잭션을
          되돌릴 수 있기 때문이다.
        </p>
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

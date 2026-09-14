import { Block, Figure, Note } from './parts';

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

      <Figure>
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
                <span>테이블스페이스의 페이지를 캐싱한다</span>
              </div>
              <span className="map__flow map__flow--both" />
              <div className="map__cell map__cell--disk">
                <b>Tablespaces (.ibd)</b>
                <span>행과 인덱스가 실제로 사는 곳</span>
              </div>

              <span className="map__flow map__flow--both" />
              <div className="map__cell map__cell--disk">
                <b>Undo Tablespaces</b>
                <span>바꾸기 전 값. 롤백과 MVCC 가 읽는다</span>
              </div>

              <div className="map__cell map__cell--mem">
                <b>Log Buffer</b>
                <span>redo 레코드를 모아 뒀다가 커밋 시점에 내려보낸다</span>
              </div>
              <span className="map__flow map__flow--out" />
              <div className="map__cell map__cell--disk">
                <b>Redo Log</b>
                <span>페이지를 어떻게 바꿨는지. 장애 복구용</span>
              </div>

              <div className="map__cell map__cell--mem map__cell--solo">
                <b>Change Buffer</b>
                <span>버퍼 풀에 없는 세컨더리 인덱스 페이지의 변경을 모아 둔다</span>
              </div>
              <span />
              <div className="map__cell map__cell--disk map__cell--solo">
                <b>Doublewrite</b>
                <span>제자리에 쓰기 전 페이지를 통째로 복사해 둔다</span>
              </div>

              <div className="map__cell map__cell--mem map__cell--solo">
                <b>Adaptive Hash Index</b>
                <span>자주 쓰이는 탐색 경로를 해시로 질러간다</span>
              </div>
              <span />
              <span />
            </div>
          </section>

        </div>
      </Figure>

      <Block title="Buffer Pool">
        <p>
          테이블스페이스의 페이지를 담아 두는 캐시이자, 사실상 InnoDB 가 일하는 <b>작업대</b>다. 읽기는
          여기 있으면 디스크에 가지 않고, 쓰기도 디스크가 아니라 여기 있는 페이지를 고친다. 디스크와
          달라진 페이지를 <b>더티</b>라고 부른다.
        </p>
        <p>
          자리가 차면 오래된 것부터 밀어내는데, 한 번 쓰고 마는 큰 스캔이 캐시를 통째로 갈아엎지 않도록
          LRU 를 <b>young · old 두 구간</b>으로 나눠 둔다. 새로 읽은 페이지는 목록 가운데(old 쪽)에
          들어가고, 거기서 <b>한 번 더</b> 읽혀야 young 으로 올라간다. 그래서 풀 스캔이 지나가도 정작
          자주 쓰이는 페이지는 살아남는다.
        </p>
        <p>
          더티 페이지가 디스크로 내려가는 시점은 <b>커밋이 아니다</b>. page cleaner 스레드가
          ① 빈 자리가 모자랄 때(LRU 꼬리에서) ② 체크포인트가 밀릴 때(오래 바뀐 순으로) ③ 한가할 때
          ④ 종료할 때 내보낸다. 커밋이 보장하는 건 redo 뿐이고, 데이터 파일은 한참 뒤에 따라온다.
        </p>
      </Block>

      <Block title="Change Buffer">
        <p>
          세컨더리 인덱스를 고쳐야 하는데 그 페이지가 버퍼 풀에 없으면, 원래는 그 페이지 하나 때문에
          디스크를 읽어야 한다. change buffer 는 그 변경을 <b>메모리에 적어 두고 넘어간다</b>. 나중에
          누군가 그 페이지를 읽을 때 비로소 합친다.
        </p>
        <p>
          왜 세컨더리만인가 — 클러스터드 인덱스는 어차피 행을 바꾸려면 그 페이지를 읽어야 하고,{' '}
          <b>유니크</b> 세컨더리 인덱스는 중복 여부를 확인하려면 페이지를 봐야 하기 때문이다. 읽지
          않아도 되는 경우에만 미룰 수 있다.
        </p>
        <p>
          랜덤한 값의 인덱스에 대량 INSERT 를 할 때 효과가 크지만, 반대로 합치기 전에 그 페이지를 읽는
          워크로드라면 이득이 없다. 이 영역은 버퍼 풀의 일부를 쓴다(<code>innodb_change_buffer_max_size</code>).
        </p>
      </Block>

      <Block title="Adaptive Hash Index">
        <p>
          같은 형태의 탐색이 반복되면 InnoDB 가 알아서 <b>해시 인덱스를 만들어</b> B+tree 를 루트부터
          내려가는 과정을 건너뛴다. 사용자가 만들거나 지정하는 것이 아니라 접근 패턴을 보고 자동으로
          생긴다.
        </p>
        <p>
          버퍼 풀 내용에서 파생된 것이라 <b>디스크에 저장되지 않는다</b>. 재시작하면 사라지고, 다시
          쌓인다. 등호 조회에만 쓰이고 범위 조회에는 쓸 수 없다. 동시성이 아주 높으면 이걸 지키는
          래치가 오히려 병목이 돼서 끄는 편이 빠른 경우도 있다.
        </p>
      </Block>

      <Block title="Log Buffer · Redo Log">
        <p>
          둘은 한 물건의 메모리 쪽과 디스크 쪽이다. 페이지를 바꾸기 <b>전에</b> “무엇을 어떻게 바꿨다”를
          먼저 기록하는 것이 <b>WAL</b>(Write-Ahead Logging) 이고, 그 기록이 redo 레코드다. 레코드마다
          붙는 일련번호가 <b>LSN</b> 이고, 페이지에도 마지막으로 적용된 LSN 이 적혀 있어서 복구할 때 어디까지
          반영됐는지 판단한다.
        </p>
        <p>
          로그 버퍼가 파일로 나가는 시점은 <b>커밋</b>, 그리고 1초마다 · 버퍼가 차면 · 해당 페이지를
          내려쓰기 직전이다. 커밋 시점의 동작은 <code>innodb_flush_log_at_trx_commit</code> 이 정한다 —
          기본값 1 은 매 커밋마다 fsync 까지 하고(가장 안전), 2 는 OS 에 넘기기만 하며, 0 은 1초마다
          몰아서 한다.
        </p>
        <p>
          redo 파일은 <b>고정 크기로 돌려쓴다</b>. 그래서 이미 데이터 파일에 반영된 구간은 지워도 되는데,
          그 경계가 <b>체크포인트 LSN</b> 이다. 체크포인트가 밀리면 지울 구간이 없어 쓰기가 멈칫하므로,
          더티 페이지 flush 와 redo 공간은 한 몸으로 움직인다.
        </p>
      </Block>

      <Block title="Undo Tablespaces">
        <p>
          행을 바꾸기 전 값을 남기는 곳. 손님이 둘이다 — <b>ROLLBACK</b> 은 이걸 거꾸로 적용해 되돌리고,{' '}
          <b>MVCC</b> 는 같은 기록을 따라가 자기 시점에 맞는 옛 버전을 읽는다. 그래서 읽기가 락 없이
          지나갈 수 있다.
        </p>
        <p>
          undo 는 로그이면서 동시에 <b>페이지</b>다. undo 레코드는 undo 페이지에 쓰이고, 그 페이지는 다른
          페이지처럼 버퍼 풀을 거친다. 그리고 그 페이지 변경 자체가 다시 redo 로 기록된다 — 장애가 나도
          undo 가 함께 복구돼야 미완 트랜잭션을 되돌릴 수 있기 때문이다.
        </p>
        <p>
          더 이상 아무도 그 옛 버전을 보지 않게 되면 <b>purge</b> 스레드가 정리한다. 오래 열어 둔
          트랜잭션 하나가 read view 를 붙들고 있으면 purge 가 밀려 이 영역이 계속 커진다.
        </p>
      </Block>

      <Block title="Tablespaces">
        <p>
          행과 인덱스가 최종적으로 사는 파일. 기본값 <b>file-per-table</b> 에서는 테이블마다{' '}
          <code>.ibd</code> 파일이 하나씩 생기고, 그 안에 클러스터드 인덱스와 세컨더리 인덱스가 함께
          들어간다. 테이블을 지우면 파일째 사라져 공간이 OS 로 바로 돌아간다.
        </p>
        <p>
          파일 안이 어떻게 나뉘는지 — 세그먼트 · 익스텐트 · 페이지 — 는 다음 장에서 다룬다.
        </p>
      </Block>

      <Block title="Doublewrite Buffer">
        <p>
          더티 페이지를 <code>.ibd</code> 제자리에 쓰기 <b>전에</b>, 먼저 이 영역에 통째로 한 벌 쓴다.
          쓰기 도중 전원이 나가 16KB 중 4KB 만 기록된 <b>찢어진 페이지</b>가 생기면 이 사본으로 되살린다.
        </p>
        <p>
          redo 만으로는 이걸 못 고친다. redo 는 “온전한 페이지에 이 변경을 더해라”라는 기록이라, 페이지
          자체가 깨져 있으면 적용할 바탕이 없기 때문이다. 그래서 로그가 아니라 <b>사본</b>이 필요하다.
        </p>
        <p>
          쓰기가 두 번 일어나지만 두 번째는 순차 쓰기 한 번으로 묶여서, 체감 비용은 이름만큼 크지 않다.
          8.0.20 부터는 시스템 테이블스페이스 안이 아니라 별도 파일(<code>*.dblwr</code>)로 빠졌다.
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

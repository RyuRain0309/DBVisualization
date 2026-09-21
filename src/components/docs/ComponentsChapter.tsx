import { Block, Figure, Note, Sub, Var } from './parts';

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
              <span>행을 읽고 쓰며, 락 · 트랜잭션 · 복구를 담당한다</span>
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
                <span>행과 인덱스가 저장되는 파일</span>
              </div>

              <span className="map__flow map__flow--both" />
              <div className="map__cell map__cell--disk">
                <b>Undo Tablespaces</b>
                <span>변경 전 값. 롤백과 MVCC 가 읽는다</span>
              </div>

              <div className="map__cell map__cell--mem">
                <b>Log Buffer</b>
                <span>redo 레코드를 모아 뒀다가 커밋 시점에 내려보낸다</span>
              </div>
              <span className="map__flow map__flow--out" />
              <div className="map__cell map__cell--disk">
                <b>Redo Log</b>
                <span>페이지 변경 내용. 장애 복구용</span>
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
                <span>반복되는 탐색 경로를 해시로 대신한다</span>
              </div>
              <span />
              <span />
            </div>
          </section>

        </div>
      </Figure>

      <Block title="Buffer Pool" side="memory">
        <p>
          테이블스페이스의 페이지를 메모리에 보관하는 캐시다. 읽으려는 페이지가 여기 있으면 디스크
          접근이 없고, 없으면 디스크에서 읽어 올린 뒤 여기에 둔다. 변경도 디스크가 아니라 이 안의
          페이지에 적용된다. 디스크의 내용과 달라진 페이지를 <b>Dirty Page</b>라고 한다.
        </p>

        <Sub title="페이지 교체 알고리즘 — Midpoint Insertion LRU">
          <p>
            큰 테이블을 풀 스캔하면 수만 개의 페이지가 버퍼 풀로 들어온 경우 일반 LRU 는 이 페이지들을 전부 목록 맨 앞에 넣으면서 자주 조회되던 페이지가 밀려 삭제되는 일이 발생한다.
          </p>
          <p>
            이를 해결하기 위해 InnoDB는 <b>새 페이지는</b> 목록 맨 앞이 아니라 <b>중간</b>에 넣는 전략을 취한다.<br/>
            중간 지점 위치는 설정값(<Var name="innodb_old_blocks_pct" />)에 의해 정해지며 앞부분은 <b>New sublist</b> 뒷부분은 <b>Old sublist</b>라고 한다.<br/>
          </p>
          <ul className="doc-steps">
            <li>
              <b>삽입</b> — 새 페이지는 old sublist 맨 앞으로 들어간다.
            </li>
            <li>
              <b>승격</b> — old 에 있는 동안 다시 접근되면 new 맨 앞으로 옮긴다. 스캔이 한 페이지 안의 행들을 이어 읽는 것을 재접근으로 오해하지 않기 위해 삽입 후 설정값 (<Var name="innodb_old_blocks_time" />) 동안의 접근은 무시한다.
            </li>
            <li>
              <b>제거</b> — 자리가 필요하면 old 맨뒤부터 제거한다. 더티 페이지 경우에는 flush 후 제거된다.
            </li>
          </ul>
        </Sub>

        <Sub title="더티 페이지를 디스크에 기록하는 시점">
          <p>
            아래 상황에서 <b>Buffer Pool</b> 내 <b>Dirty Page</b>를 <b>Page Cleaner</b> 스레드를 통해 <b>Flush</b> 된다.
          </p>
          <ul className="doc-steps">
            <li>
              <b>LRU Flushing</b> — Page Cleaner 스레드가 약 1초 주기로 LRU 목록 끝(old sublist tail)부터 
              최대 설정값(<Var name="innodb_lru_scan_depth" />)까지 읽으면서 빈 프레임을 확보하는 과정에서 더티 페이지는 flush가 된다.
              <p className="note">
                <b>참고</b> — 이 백그라운드 청소가 워크로드를 못 따라가 빈 프레임이 실제로 바닥나면,
                새 페이지를 읽어야 하는 쿼리 스레드가 직접 LRU tail의 더티 페이지 하나를 동기적으로
                flush한다(Single Page Flush). 정상적인 경로가 아니라 예외 상황이며, 이게 잦다면{' '}
                <Var name="innodb_lru_scan_depth" /> 조정 등 튜닝이 필요하다는 신호다.
              </p>
            </li>
            <li>
              <b>체크포인트 지연 방지</b> — Redo Log는 크기가 고정된 원형 구조라, 기존 공간을
              재사용하려면 그 변경사항이 디스크에 반영되어 있어야 한다. 현재 LSN과
              체크포인트 LSN(반영 완료 지점)의 격차가 벌어질수록, 가장 오래전에 변경된 dirty
              page부터 flush해 체크포인트 LSN을 전진시킨다.
              <p className="note">
                <b>참고</b> — 이 flush는 격차가 다 벌어진 뒤 한 번에 처리하는 게 아니라, 격차가
                커지는 정도에 비례해 <Var name="innodb_adaptive_flushing" />가 flush 속도를
                지속적으로 끌어올리는 선제적 방식이다. 만약 이 조절이 늦어 Redo Log 공간이 실제로
                바닥나면, InnoDB는 새 트랜잭션의 커밋 자체를 막고 밀린 dirty page를 강제로 몰아서
                flush한다(sync flush) — 쿼리 스레드 하나가 지연되는 Single Page Flush보다 훨씬
                심각한, 서버 전체의 쓰기가 멈추는 사태다.
              </p>
            </li>
            <li>
              <b>유휴 상태</b> — 부하가 낮을 때 백그라운드로 조금씩 기록한다.
            </li>
            <li>
              <b>종료</b> — <code>innodb_fast_shutdown=0</code> 이면 종료 시 전부 기록한다.
            </li>
          </ul>
          <p>
            어느 경우든 WAL 규칙이 우선한다. 페이지를 기록하기 전에 그 페이지의 LSN 까지의 redo 가 먼저
            영속화돼야 하며, 기록 경로는 <code>Buffer Pool → doublewrite → .ibd</code> 순이다.
          </p>
        </Sub>
      </Block>

      <Block title="Change Buffer" side="memory">
        <p>
          세컨더리 인덱스는 값이 무작위로 흩어져 있어, INSERT 시 갱신할 페이지가 버퍼 풀에 없는
          경우가 잦다. Change Buffer 는 이때 페이지를 읽지 않고 <b>변경 내용만</b> 기록해 두었다가,
          그 페이지가 다른 이유로 버퍼 풀에 올라올 때 한꺼번에 적용한다. 쌓인 변경을 읽기 한 번으로
          처리하므로 랜덤 I/O 가 줄어든다.
        </p>
        <p>
          대상은 <b>비유니크 세컨더리 인덱스</b>뿐이다. 클러스터드 인덱스는 행 자체를 변경해야 하고,
          유니크 인덱스는 중복 검사가 필요해 페이지를 읽어야하기 때문이다.
        </p>
        <p>버퍼 풀의 일부를 사용하며 비율은{' '}<Var name="innodb_change_buffer_max_size" /> 로 정한다.
        </p>
      </Block>

      <Block title="Adaptive Hash Index" side="memory">
        <p>
          페이지가 전부 버퍼 풀에 있어도, B+tree 통해 루트부터 리프까지 내려가는 탐색 자체에는
          비용이 든다. 동일한 형태의 탐색이 반복되면 InnoDB 가 해당 경로에 대한 해시 인덱스를
          자동으로 생성해 이 과정을 생략한다. 사용자가 생성하거나 지정하는 대상이 아니라 접근
          패턴에 따라 만들어진다.
        </p>
        <p>
          버퍼 풀에 올라온 페이지를 기준으로 만들어지므로 디스크에 저장되지 않는다. 재시작하면
          사라지고 이후 접근 패턴에 따라 다시 생성된다. 등호 조건 탐색에만 사용되고 범위 조건에는
          사용되지 않는다. 동시성이 높은 환경에서는 이 구조를 보호하는 래치가 경합을 일으켜,
          비활성화하는 편이 빠른 경우도 있다.
        </p>
      </Block>

      <Block title="Log Buffer · Redo Log" side="both">
        <p>
          페이지를 변경하기 전에 변경 내용을 먼저 기록하는 방식을 <b>WAL</b>(Write-Ahead Logging) 이라 하고, 
          그 기록 단위가 redo 레코드다. 레코드마다{' '}<b>LSN</b> 이라는 일련번호가 붙고, 각 페이지에도 
          마지막으로 반영된 LSN 이 저장돼 있어 복구 시점에 어디까지 적용됐는지 판별한다.
        </p>

        <Sub title="로그 버퍼를 파일에 기록하는 시점">
          <p>
            커밋을 완료로 인정하려면 그 시점까지의 redo 가 디스크에 안전하게 반영돼 있어야
            하므로 로그 버퍼는 <b>커밋</b>이 주된 기록 시점이며 그 밖에도 3가지가 있다.
          </p>
          <ul className="doc-steps">
            <li>
              <b>커밋</b> — 해당 트랜잭션의 redo 를 파일에 기록한다.{' '}<Var name="innodb_flush_log_at_trx_commit" /> 값에 의해 Durability 수준이 정해진다.
              <div className="note">
                <b>참고</b>
                <table>
                  <thead>
                    <tr>
                      <th>값</th>
                      <th>커밋 시 동작</th>
                      <th>안전 범위</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>1 (기본)</td>
                      <td>write + fsync</td>
                      <td>OS 레벨까지 안전</td>
                    </tr>
                    <tr>
                      <td>2</td>
                      <td>write만, fsync는 1초 주기</td>
                      <td>DB 레벨까지만 안전</td>
                    </tr>
                    <tr>
                      <td>0</td>
                      <td>둘 다 1초 주기에 위임</td>
                      <td>안전 범위 없음</td>
                    </tr>
                  </tbody>
                </table>
                <p>2 와 0 은 <b>Durability</b> 를 일부 포기하고 처리량을 얻는 선택이다.</p>
              </div>        
            </li>
            <li>
              <b>약 1초 주기</b> — 백그라운드 스레드가 커밋 여부와 무관하게 주기적으로 기록한다. 위의 0
              · 2 설정에서 실제로 파일에 닿는 경로가 이것이다.
            </li>
            <li>
              <b>버퍼 사용량</b> — 로그 버퍼(<Var name="innodb_log_buffer_size" />)가 절반쯤 차면 기록해
              공간을 비운다.
              <p className="note">
                <b>참고</b> — 한 트랜잭션에서 변경(INSERT · UPDATE)이 많으면 그만큼 redo 로그가 쌓인다.{' '}
                <Var name="innodb_log_buffer_size" />가 작으면 커밋 전에 버퍼가 여러 번 차게되어 
                flush가 반복되어 성능이 떨어지게 된다.
              </p>
            </li>
            <li>
              <b>WAL 규칙</b> — 어떤 페이지를 디스크에 기록하기 직전, 그 페이지의 LSN 까지의 redo 를
              먼저 기록한다. 버퍼 풀의 flush 가 로그 버퍼의 flush 를 끌어내는 경우다.
            </li>
          </ul>
        </Sub>

        <Sub title="Redo Log 공간 — 순환과 체크포인트">
          <p>
            redo 파일은 고정된 크기(<Var name="innodb_redo_log_capacity" />)를 순환하며 재사용한다.
            데이터 파일에 이미 반영된 구간을 덮어쓰게 되고, 그 경계가 <b>체크포인트 LSN</b> 이다.
          </p>
          <p>
            고정적인 Redo log의 <b>사용 가능한 공간 확보</b>는 <b>Buffer pool</b>를 통해 일어난다. 
            <b>Dirty Page</b>가 <b>flush</b> 돼야 체크포인트 LSN 이 전진하고, 그만큼 재사용할 수 있게 된다. 
            이게 밀리면 redo 공간이 바닥나 모든 쓰기가 대기 상태가 된다.
          </p>
        </Sub>
      </Block>

      <Block title="Undo Tablespaces" side="disk">
        <p>
          행을 변경하기 전의 값을 기록하는 영역이며, 두 가지 용도로 쓰인다. <b>ROLLBACK</b> 은 이 기록을 역순
          으로 적용해 변경을 취소하고, <b>MVCC</b> 는 같은 기록을 따라가 각 트랜잭션 시점에 해당하는 이전
          버전을 읽는다.
        </p>
        <p>
          undo 레코드는 undo 로그 페이지에 저장되고, 이 페이지 역시 다른 페이지와 동일하게 버퍼 풀을
          거친다. undo 페이지의 변경 또한 redo 레코드로 기록 되는데 장애 발생 시 undo 가 함께 복구돼야
          미완료 트랜잭션을 되돌릴 수 있기 때문이다.
        </p>
        <p>
          해당 이전 버전을 참조할 수 있는 트랜잭션이 더 이상 없으면 <b>purge</b> 스레드가 제거한다.
          장시간 유지되는 트랜잭션이 read view 를 보유하고 있으면 purge 가 진행되지 못해 이 영역이
          계속 증가한다.
        </p>
      </Block>

      <Block title="Tablespaces" side="disk">
        <p>
          행과 인덱스가 저장되는 파일이다. 기본 설정인 <b>file-per-table</b> 에서는 테이블마다{' '}
          <code>.ibd</code> 파일이 하나씩 생성되고, 그 안에 클러스터드 인덱스와 세컨더리 인덱스가 함께
          저장된다. 테이블을 삭제하면 파일 자체가 제거되므로 공간이 즉시 운영체제로 반환된다.
        </p>
        <p>파일 내부가 세그먼트 · 익스텐트 · 페이지로 나뉘는 구조는 다음 장에서 다룬다.</p>
      </Block>

      <Block title="Doublewrite Buffer" side="disk">
        <Sub title="문제 — 16KB 쓰기는 원자적이지 않다">
          <p>
            디스크와 OS 가 원자성을 보장하는 단위는 보통 512B 나 4KB 다. InnoDB 페이지는 16KB 라
            물리적으로는 블록 여러 개로 나뉘어 나간다. 그 도중에 전원이 나가면 이런 페이지가 남는다.
          </p>
          <div className="torn">
            <span className="torn__block torn__block--new">4KB 새 내용</span>
            <span className="torn__block torn__block--new">4KB 새 내용</span>
            <span className="torn__block torn__block--old">4KB 옛 내용</span>
            <span className="torn__block torn__block--old">4KB 옛 내용</span>
          </div>
          <p>
            새 버전도 옛 버전도 아닌, 존재한 적 없는 상태다. 이것을 <b>부분 기록 페이지</b>(torn page)
            라고 한다. 페이지에 저장된 체크섬이 맞지 않으므로 InnoDB 가 알아채기는 하지만, 알아채는
            것과 복구하는 것은 다른 문제다.
          </p>
          <p>
            redo 로는 복구되지 않는다. redo 레코드는 "페이지 N 의 이 자리를 이렇게 바꿔라" 형태로{' '}
            <b>온전한 페이지를 출발점으로 삼아야</b> 적용된다. 즉 위와 같은 상태의 페이지에는 적용할 수 없다.
          </p>
        </Sub>

        <Sub title="해법 — 쓰기 전에 사본을 남긴다">
          <p>더티 페이지를 기록할 때 두 번에 나눠 쓴다.</p>
          <ol className="doc-steps">
            <li>
              <b>사본</b> — 페이지를 doublewrite 영역에 먼저 기록한다.
            </li>
            <li>
              <b>본 기록</b> — 그다음 <code>.ibd</code> 의 원래 위치에 기록한다.
            </li>
          </ol>
          <p>이러면 어느 쪽에서 장애가 나든 온전한 페이지가 한 쪽에는 남는다.</p>
          <ul className="doc-steps">
            <li>
              <b>사본 기록 중 장애 복구</b> — <code>.ibd</code> 의 페이지는 아직 건드리지 않은 완전한 상태로 
              이를 기반으로 redo 를 적용하여 복구한다.
            </li>
            <li>
              <b>본 기록 중 장애</b> — <code>.ibd</code> 는 찢어졌지만 doublewrite(사본)은 완성돼 있다.
              그것으로 덮어쓴 뒤 redo 를 적용하여 복구한다.
            </li>
          </ul>
          <div className="note">
            <b>참고</b>
            <p>
              doublewrite 영역은 연속된 구간으로 여러 페이지를 모아 <b>순차 쓰기</b>로 처리된다.
              파일 곳곳에 흩어진 <code>.ibd</code> 의 <b>랜덤 쓰기</b>에 비해 비용이 저렴하여 큰 부담은 없지만,
              하드웨어가 페이지 크기 이상의 원자적 쓰기를 보장하는 환경에서는{' '}
              <code>innodb_doublewrite=0</code> 으로 끄기도 한다.
            </p>
          </div>
        </Sub>
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

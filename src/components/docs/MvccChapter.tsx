import { Block, Figure, Note, Roles } from './parts';

interface Case {
  trxId: string;
  reason: string;
  visible: boolean;
}

/** Four DB_TRX_ID values judged against one read view of {creator 18, active [20, 22], min 20, max 23}. */
const CASES: Case[] = [
  { trxId: 'DB_TRX_ID 25', reason: 'max_trx_id 23 이상 — 뷰를 뜬 뒤에 시작한 트랜잭션', visible: false },
  { trxId: 'DB_TRX_ID 22', reason: '경계 안이지만 뷰를 뜰 때 아직 실행 중이던 트랜잭션', visible: false },
  { trxId: 'DB_TRX_ID 18', reason: '내 트랜잭션이 직접 바꾼 버전', visible: true },
  { trxId: 'DB_TRX_ID 15', reason: 'min_trx_id 20 보다 작음 — 뷰를 뜨기 전에 이미 커밋', visible: true },
];

/** What MVCC is, what it is made of, and how the isolation levels differ on top of it. */
export function MvccChapter() {
  return (
    <>
      <p className="doc-lead">
        MVCC 는 <strong>Multi-Version Concurrency Control</strong>, 한 행의 옛 버전을 지우지 않고
        남겨 두는 방식이다. 읽는 쪽은 지금 페이지에 있는 최신 값이 아니라{' '}
        <strong>자기 시점에 맞는 버전</strong>을 undo 에서 찾아 읽는다. 그래서 읽기가 쓰기를 기다리지
        않고, 쓰기도 읽기를 기다리지 않는다 — 락 없이 되는 일관된 읽기가 여기서 나온다.
      </p>

      <Block title="MVCC 를 이루는 세 가지">
        <Roles
          rows={[
            [
              'DB_TRX_ID',
              <>
                행에 붙은 숨은 컬럼. <b>이 버전을 만든 트랜잭션 id</b> 다. 읽는 쪽이 판단하는 기준값.
              </>,
            ],
            [
              'DB_ROLL_PTR + undo',
              <>
                직전 버전이 든 undo 레코드를 가리키는 포인터. 포인터가 이어져 한 행의{' '}
                <b>버전 체인</b>이 만들어진다.
              </>,
            ],
            [
              'Read View',
              <>
                읽기를 시작할 때 찍는 스냅샷. 그 순간 <b>실행 중이던 트랜잭션 id 목록</b>과 경계값{' '}
                <code>min_trx_id</code> · <code>max_trx_id</code>, 그리고 자기 id 를 들고 있다.
              </>,
            ],
          ]}
        />
      </Block>

      <Block title="어떤 버전이 보이는가">
        <p>
          read view 하나가 정해지면, 버전 하나하나는 자기 <code>DB_TRX_ID</code> 가 어느 구간에
          떨어지는지로 판정된다.
        </p>

        <Figure caption="경계 바깥은 계산 없이 결정되고, 가운데 구간만 활성 트랜잭션 목록을 뒤진다.">
          <div className="vzone">
            <div className="vzone__bar">
              <div className="vzone__seg vzone__seg--yes">
                <b>보인다</b>
                <span>뷰를 뜨기 전에 이미 끝난 트랜잭션</span>
              </div>
              <div className="vzone__seg vzone__seg--maybe">
                <b>목록을 확인</b>
                <span>그때 실행 중이었으면 안 보이고, 아니면 보인다</span>
              </div>
              <div className="vzone__seg vzone__seg--no">
                <b>안 보인다</b>
                <span>뷰를 뜬 뒤에 시작한 트랜잭션</span>
              </div>
            </div>
            <div className="vzone__ticks">
              <span />
              <span>▲ min_trx_id</span>
              <span>▲ max_trx_id</span>
            </div>
            <p className="vzone__axis">DB_TRX_ID 가 커지는 방향 →</p>
          </div>
        </Figure>

        <p>
          자기 트랜잭션이 만든 버전은 이 판정보다 앞서 항상 보인다. 그리고 <b>안 보이는 버전을 만나면
          끝이 아니라</b>, <code>DB_ROLL_PTR</code> 를 따라 한 칸 옛 버전으로 내려가 같은 판정을
          반복한다. 볼 수 있는 버전이 나올 때까지, 또는 체인이 끝날 때까지.
        </p>

        <Figure caption="read view 가 { 내 id 18 · 활성 [20, 22] · min 20 · max 23 } 일 때의 판정 결과. 실제 읽기는 최신 버전부터 내려오다가 처음으로 보이는 버전에서 멈춘다.">
          <ul className="vcase">
            {CASES.map((entry) => (
              <li key={entry.trxId} className={entry.visible ? 'vcase--yes' : 'vcase--no'}>
                <code>{entry.trxId}</code>
                <span>{entry.reason}</span>
                <b>{entry.visible ? '보인다' : '안 보인다'}</b>
              </li>
            ))}
          </ul>
        </Figure>
      </Block>

      <Block title="격리수준은 read view 를 언제 뜨는가의 차이">
        <p>
          판정 규칙은 격리수준과 무관하게 같다. 달라지는 건 <b>read view 를 언제, 몇 번 뜨느냐</b>다.
        </p>

        <Figure caption="같은 시나리오, 같은 데이터. 두 번째 SELECT 에서 결과가 갈리는 이유는 뷰를 새로 떴는지 하나를 계속 쓰는지뿐이다.">
          <div className="mvtl">
            <div className="mvtl__head">
              <span />
              <span>BEGIN</span>
              <span>SELECT ①</span>
              <span>다른 세션이 UPDATE 후 COMMIT</span>
              <span>SELECT ②</span>
            </div>
            <div className="mvtl__lane">
              <b>READ COMMITTED</b>
              <span>—</span>
              <span>
                뷰 v1 <em>→ 'b'</em>
              </span>
              <span className="mvtl__event">name = 'b2'</span>
              <span className="mvtl__change">
                뷰 v2 를 새로 뜬다 <em>→ 'b2'</em>
              </span>
            </div>
            <div className="mvtl__lane">
              <b>REPEATABLE READ</b>
              <span>—</span>
              <span>
                뷰 v1 <em>→ 'b'</em>
              </span>
              <span className="mvtl__event">name = 'b2'</span>
              <span>
                뷰 v1 그대로 <em>→ 'b'</em>
              </span>
            </div>
          </div>
        </Figure>

        <Roles
          rows={[
            [
              'READ UNCOMMITTED',
              <>
                read view 를 아예 뜨지 않는다. 페이지에 있는 최신 버전을 그대로 읽으므로 커밋되지 않은
                값도 보인다(dirty read).
              </>,
            ],
            [
              'READ COMMITTED',
              <>
                <b>문장마다</b> 새 뷰를 뜬다. 항상 그 시점에 커밋된 값을 보므로, 같은 트랜잭션 안에서
                같은 질의의 답이 달라질 수 있다(non-repeatable read).
              </>,
            ],
            [
              'REPEATABLE READ',
              <>
                <b>첫 읽기에서 뜬 뷰 하나</b>를 트랜잭션이 끝날 때까지 쓴다. 일관된 읽기만 보면
                팬텀도 생기지 않는다 — 나중에 커밋된 행은 뷰 기준으로 보이지 않기 때문이다.
              </>,
            ],
            [
              'SERIALIZABLE',
              <>
                평범한 SELECT 까지 잠금 읽기로 바꾼다. 사실상 MVCC 대신 락으로 순서를 맞춘다.
              </>,
            ],
          ]}
        />
      </Block>

      <Block title="일관된 읽기와 잠금 읽기">
        <p>
          MVCC 로 읽는 건 <b>평범한 SELECT</b> 뿐이다. <code>SELECT ... FOR UPDATE</code> ·{' '}
          <code>FOR SHARE</code> 와 UPDATE · DELETE 는 스냅샷이 아니라{' '}
          <b>가장 최근에 커밋된 버전</b>을 보고 거기에 락을 건다. 남이 바꾸는 중이면 기다린다.
        </p>
        <p>
          그래서 REPEATABLE READ 안에서도 SELECT 가 보여 준 값과 UPDATE 가 실제로 덮어쓰는 값이 다를
          수 있다. 읽은 값을 근거로 갱신할 생각이라면 처음부터 잠금 읽기로 읽어야 한다.
        </p>
      </Block>

      <Block title="옛 버전은 언제 사라지는가">
        <p>
          DELETE 는 행을 바로 지우지 않는다. 삭제 표시만 남기고, 그 행을 아직 보고 있을지 모르는
          트랜잭션을 위해 undo 를 남겨 둔다. 아무 read view 도 더 이상 그 버전을 필요로 하지 않게 되면
          그때 <b>purge</b> 스레드가 undo 와 삭제 표시된 레코드를 정리한다.
        </p>
        <p>
          열어 두고 커밋하지 않은 트랜잭션 하나가 오래 남아 있으면 그 뷰 때문에 purge 가 밀리고, undo
          가 계속 쌓여 테이블스페이스가 부푼다. 오래 열린 트랜잭션이 위험한 이유다.
        </p>
        <Note>
          이 시뮬레이터는 read view 생성 · 가시성 판정 · 버전 체인 탐색 · purge 를 실제 규칙 그대로
          구현한다. 격리수준 · MVCC 탭에서 세션마다 뜬 뷰와 그 뷰가 무엇을 보는지 확인할 수 있다.
        </Note>
      </Block>
    </>
  );
}

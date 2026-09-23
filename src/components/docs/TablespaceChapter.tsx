import { Block, Figure, Note, Roles, Sub } from './parts';

/** The file itself: how many there are, what lives inside one, and what the other files are for. */
export function TablespaceChapter() {
  return (
    <>
      <p className="doc-lead">
        테이블스페이스는 InnoDB 가 데이터를 담는 <strong>파일</strong>이다. 기본 설정
        (file-per-table)에서는 테이블을 만들 때마다 <code>.ibd</code> 파일이 하나씩 생기고, 그 테이블의
        모든 인덱스가 그 안에 들어간다.
      </p>

      <Figure caption="users 테이블 하나가 쓰는 파일. 인덱스가 몇 개든 파일은 하나이고, 그 안에서 인덱스별로 자리가 나뉜다.">
        <div className="tsp">
          <div className="tsp__file">
            <span className="tsp__name">users.ibd</span>
            <div className="tsp__slots">
              <span className="tsp__slot tsp__slot--meta">
                <b>관리용 페이지</b>
                <em>공간 관리 정보 · 세그먼트 목록</em>
              </span>
              <span className="tsp__slot">
                <b>PRIMARY</b>
                <em>클러스터드 인덱스 — 행 전체</em>
              </span>
              <span className="tsp__slot">
                <b>idx_email</b>
                <em>세컨더리 인덱스 — 키 + PK</em>
              </span>
            </div>
          </div>
        </div>
      </Figure>

      <Block title="파일이 테이블마다 하나인 이유">
        <p>
          예전에는 모든 테이블이 <code>ibdata1</code> 하나를 나눠 썼다. 그러면 테이블을 지워도 파일이
          줄지 않아, 빈 공간이 파일 안에 남은 채 디스크를 계속 차지했다.
        </p>
        <p>
          file-per-table 에서는 테이블을 지우면 <b>파일 자체가 사라지므로</b> 공간이 즉시 운영체제로
          돌아간다. 테이블 단위로 백업하거나 다른 서버로 옮기는 것도 이 구조라서 가능하다
          (<code>ALTER TABLE ... DISCARD/IMPORT TABLESPACE</code>).
        </p>
      </Block>

      <Block title="파일 안의 첫 페이지들">
        <p>
          <code>.ibd</code> 의 앞쪽 몇 장은 데이터가 아니라 <b>이 파일을 관리하는 정보</b>다. 어디가
          비어 있는지, 세그먼트가 어떤 페이지를 갖고 있는지를 여기에 적어 둔다.
        </p>
        <Roles
          rows={[
            ['0번 페이지', <>파일 전체의 공간 관리 정보. 빈 익스텐트 목록이 여기 있다</>],
            ['1번 페이지', <>체인지 버퍼가 쓰는 비트맵</>],
            ['2번 페이지', <>세그먼트 목록(inode). 세그먼트가 가진 페이지와 익스텐트를 적어 둔다</>],
            ['3번 페이지부터', <>인덱스의 루트 페이지, 그리고 실제 데이터 페이지</>],
          ]}
        />
        <p>
          그래서 갓 만든 빈 테이블의 <code>.ibd</code> 도 0 바이트가 아니라 100KB 안팎이다. 행이 하나도
          없어도 관리용 페이지는 있어야 하기 때문이다.
        </p>
      </Block>

      <Block title="다른 테이블스페이스들">
        <Sub title="Undo Tablespaces">
          <p>
            <code>undo_001</code> · <code>undo_002</code>. 롤백과 MVCC 가 쓰는 undo 로그가 여기 들어간다.
            테이블 데이터와 성격이 달라 파일을 나눠 두었고, 8.0 부터는 크기가 커지면 잘라내는 작업이
            자동으로 돈다.
          </p>
        </Sub>
        <Sub title="System Tablespace">
          <p>
            <code>ibdata1</code>. 8.0 이전에는 데이터 딕셔너리와 체인지 버퍼가 여기 있었다. 지금도
            남아 있지만 예전만큼 많은 것을 담지는 않는다.
          </p>
        </Sub>
        <Sub title="Temporary Tablespaces">
          <p>
            임시 테이블이 디스크로 내려갈 때 쓴다. 세션마다 빌려 쓰는{' '}
            <code>#innodb_temp/temp_N.ibt</code> 와, 그 변경의 undo 를 담는 <code>ibtmp1</code> 로 나뉜다.
            재시작할 때마다 새로 만들어지며, redo 를 남기지 않는다 — 임시 테이블은 복구 대상이 아니기
            때문이다.
          </p>
        </Sub>
        <Note>
          이 시뮬레이터는 file-per-table 구성만 다룬다. 관리용 페이지와 파일 오프셋은 모델링하지 않고,
          undo 는 파일이 아니라 메모리상의 목록으로만 관리한다.
        </Note>
      </Block>
    </>
  );
}

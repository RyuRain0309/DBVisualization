import { Block, Figure, Note, Roles } from './parts';

const PAGES_IN_EXTENT = 64;

/** Zooms from the file down to a single page: where a row physically ends up. */
export function StorageChapter() {
  return (
    <>
      <p className="doc-lead">
        테이블을 하나 만들면 디스크에 파일이 하나 생긴다. 그 안은 그냥 행이 줄줄이 쌓인 게 아니라,
        <strong> 파일 → 세그먼트 → 익스텐트 → 페이지 → 행</strong> 순서로 겹겹이 나뉘어 있다.
        InnoDB 가 디스크와 주고받는 최소 단위는 행이 아니라 <strong>페이지</strong>다.
      </p>

      <Figure caption="바깥에서 안으로 들어갈수록 단위가 작아진다. 행 하나를 읽어도 실제로는 그 행이 든 16KB 페이지 전체를 읽는다.">
        <div className="nest">
          <div className="nest__level nest__level--file">
            <span className="nest__tag">
              테이블스페이스 <code>users.ibd</code>
            </span>
            <p>테이블 하나의 모든 인덱스가 이 파일 안에 들어간다</p>

            <div className="nest__level nest__level--segment">
              <span className="nest__tag">세그먼트</span>
              <p>인덱스 하나당 리프용 · 논리프용 두 개</p>

              <div className="nest__level nest__level--extent">
                <span className="nest__tag">익스텐트 — 1MB</span>
                <div className="nest__pages">
                  {Array.from({ length: PAGES_IN_EXTENT }, (_, i) => (
                    <span key={i} className={`nest__page ${i === 0 ? 'nest__page--focus' : ''}`} />
                  ))}
                </div>
                <p>연속된 16KB 페이지 {PAGES_IN_EXTENT}개. 디스크에서 붙어 있어 범위 스캔이 빠르다</p>

                <div className="nest__level nest__level--page">
                  <span className="nest__tag">페이지 — 16KB</span>
                  <div className="nest__rows">
                    <span>id=10 · a · a@x.com</span>
                    <span>id=20 · b · b@x.com</span>
                    <span>id=30 · c · c@x.com</span>
                  </div>
                  <p>행은 여기 안에 들어간다</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Figure>

      <Block title="각 저장 단위의 역할">
        <Roles
          rows={[
            [
              '테이블스페이스',
              <>
                기본값 file-per-table 에서는 테이블마다 <code>.ibd</code> 파일이 하나다. 테이블을 지우면
                파일째 사라져 공간이 OS 로 바로 돌아간다.
              </>,
            ],
            [
              '세그먼트',
              <>
                인덱스 하나가 <b>리프 세그먼트</b>와 <b>논리프 세그먼트</b>를 따로 갖는다. 데이터가 든
                리프 페이지끼리 모아 두면 범위 스캔이 파일 위를 순서대로 훑는다.
              </>,
            ],
            [
              '익스텐트',
              <>
                페이지를 한 장씩 늘리면 파일 곳곳에 흩어진다. 그래서 1MB(16KB 페이지{' '}
                {PAGES_IN_EXTENT}개)씩 통째로 잡는다. 다만 <b>처음 32페이지</b>는 조각으로 주므로 작은
                테이블이 1MB 를 통째로 물지 않는다.
              </>,
            ],
            [
              '페이지',
              <>
                읽기 · 쓰기 · 캐싱 · 락 관리의 기준 단위. 기본 16KB(<code>innodb_page_size</code>).
                한 행만 필요해도 페이지 전체가 버퍼 풀로 올라온다.
              </>,
            ],
            [
              '행',
              <>
                페이지 안의 레코드. 한 행이 페이지의 절반을 넘으면 긴 컬럼을 <b>오버플로 페이지</b>로
                밀어내고 포인터만 남긴다. 덕분에 페이지마다 최소 두 행은 들어간다.
              </>,
            ],
          ]}
        />
        <Note>
          이 시뮬레이터는 페이지까지만 모델링한다. 세그먼트 · 익스텐트 · 파일 오프셋은 다루지 않고,
          페이지가 담는 레코드 수도 분할을 눈으로 보려고 3~8개로 낮춰 뒀다.
        </Note>
      </Block>
    </>
  );
}

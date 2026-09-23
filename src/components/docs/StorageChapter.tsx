import { Block, Figure, Note, Roles, Var } from './parts';

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
                    <span>10 · John Doe · john@example.com</span>
                    <span>20 · Jane Doe · jane@example.com</span>
                    <span>30 · Alice Kim · alice@example.com</span>
                    <span className="nest__more">⋯</span>
                  </div>
                  <p>행은 PK 순서대로 들어간다. 16KB 한 장이면 보통 수백 행이다</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Figure>

      <Block title="각 단위가 맡는 일">
        <Roles
          rows={[
            [
              '테이블스페이스',
              <>
                테이블 하나가 쓰는 파일. 그 안에 이 테이블의 모든 인덱스가 들어간다.
              </>,
            ],
            [
              '세그먼트',
              <>
                같은 용도의 페이지를 묶은 단위. 인덱스 하나가 <b>리프</b>용과 <b>논리프</b>용을 따로
                갖는다.
              </>,
            ],
            [
              '익스텐트',
              <>
                연속된 페이지 {PAGES_IN_EXTENT}장, 1MB. 공간을 배분하는 단위다.
              </>,
            ],
            [
              '페이지',
              <>
                읽기 · 쓰기 · 캐싱 · 락 관리의 기준 단위. 기본 16KB(<Var name="innodb_page_size" />).
                한 행만 필요해도 페이지 전체가 버퍼 풀로 올라온다.
              </>,
            ],
            [
              '행',
              <>
                페이지 안의 레코드. 바꾸고 읽는 대상이지만, 디스크가 이것만 따로 다루지는 않는다.
              </>,
            ],
          ]}
        />
        <p>
          테이블스페이스와 세그먼트 · 익스텐트는 다음 두 장에서, 페이지와 행은 그다음 두 장에서
          자세히 다룬다.
        </p>
        <Note>
          이 시뮬레이터는 페이지까지만 모델링한다. 세그먼트 · 익스텐트 · 파일 오프셋은 다루지 않고,
          페이지가 담는 레코드 수도 분할을 눈으로 보려고 3~8개로 낮춰 뒀다.
        </Note>
      </Block>
    </>
  );
}

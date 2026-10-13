import { Block, Figure, Note, Sub } from "./parts";

/** The file itself: how many there are, what lives inside one, and what the other files are for. */
export function TablespaceChapter() {
  return (
    <>
      <p className="doc-lead">
        테이블스페이스는 InnoDB 가 데이터를 담는 <strong>파일</strong>이다. 기본
        설정 (file-per-table)에서는 테이블을 만들 때마다 <code>.ibd</code>{" "}
        파일이 하나씩 생기고, 그 테이블의 모든 인덱스가 그 안에 들어간다.
      </p>

      <Figure>
        <div className="tsp__file">
          <span className="tsp__name">users.ibd</span>

          <div className="tsp__slot tsp__slot--meta">
            <b>관리용 페이지</b>
            <em>빈 공간 목록 · 세그먼트 목록 · 체인지 버퍼 비트맵</em>
          </div>

          <div className="tsp__slot tsp__slot--meta">
            <b>SDI 페이지</b>
            <em>이 테이블의 정의 — 컬럼과 인덱스 구성</em>
          </div>

          <div className="tsp__group">
            <span className="tsp__group-name">PRIMARY — 클러스터드 인덱스</span>
            <div className="tsp__segs">
              <span className="tsp__seg">
                <b>논리프 세그먼트</b>
                <em>내려갈 자식을 가리키는 페이지</em>
              </span>
              <span className="tsp__seg tsp__seg--leaf">
                <b>리프 세그먼트</b>
                <em>행 전체가 든 페이지</em>
              </span>
            </div>
          </div>

          <div className="tsp__group">
            <span className="tsp__group-name">세컨더리 인덱스</span>
            <div className="tsp__segs">
              <span className="tsp__seg">
                <b>논리프 세그먼트</b>
                <em>내려갈 자식을 가리키는 페이지</em>
              </span>
              <span className="tsp__seg tsp__seg--leaf">
                <b>리프 세그먼트</b>
                <em>세컨더리 인덱스 + PK 가 든 페이지</em>
              </span>
            </div>
          </div>

          <div className="tsp__group tsp__group--more">
            <span className="tsp__group-name">⋯ 인덱스를 추가할 때마다</span>
            <div className="tsp__segs">
              <span className="tsp__seg tsp__seg--ghost">
                <b>논리프 세그먼트</b>
              </span>
              <span className="tsp__seg tsp__seg--ghost">
                <b>리프 세그먼트</b>
              </span>
            </div>
          </div>

          <div className="tsp__slot tsp__slot--free">
            <b>아직 배정되지 않은 공간</b>
            <em>파일을 늘릴 때 함께 생긴, 아직 주인 없는 익스텐트</em>
          </div>
        </div>
      </Figure>

      <Block title="파일이 테이블마다 하나인 이유">
        <p>
          예전에는 모든 테이블이 <code>ibdata1</code> 하나를 나눠 썼다. 그러면
          테이블을 지워도 파일이 줄지 않아, 빈 공간이 파일 안에 남은 채 디스크를
          계속 차지했다.
        </p>
        <p>
          file-per-table 에서는 테이블을 지우면 <b>파일 자체가 사라지므로</b>{" "}
          공간이 즉시 운영체제로 돌아간다. 테이블 단위로 백업하거나 다른 서버로
          옮기는 것도 이 구조라서 가능하다 (
          <code>ALTER TABLE ... DISCARD/IMPORT TABLESPACE</code>).
        </p>
      </Block>

      <Block title="관리용 페이지">
        <p>
          <code>.ibd</code> 안에는 데이터 말고 <b>이 파일을 관리하는 정보</b>를
          담은 페이지가 있다. 번호가 정해져 있는 것과, 필요할 때 빈 자리를 받아
          쓰는 것으로 나뉜다.
        </p>
        <ul className="pagelist">
          <li>
            <span className="pagelist__tag pagelist__tag--always">고정</span>
            <b>FSP_HDR · XDES</b>
            <span>
              <code>0번 · 16384번 …</code> 빈 익스텐트가 어디인지 적어 둔다
            </span>
          </li>
          <li>
            <span className="pagelist__tag pagelist__tag--always">고정</span>
            <b>IBUF_BITMAP</b>
            <span>
              <code>1번 · 16385번 …</code> 합쳐야 할 변경이 있는 페이지를
              표시한다
            </span>
          </li>
          <li>
            <span className="pagelist__tag pagelist__tag--always">고정</span>
            <b>INODE</b>
            <span>
              <code>2번</code> 각 세그먼트가 가진 페이지와 익스텐트를 적어 둔다
            </span>
          </li>
          <li>
            <span className="pagelist__tag pagelist__tag--always">고정</span>
            <b>SDI</b>
            <span>
              <code>3번</code> 컬럼과 인덱스 구성이 든 작은 B+tree 의 루트
            </span>
          </li>
          <li>
            <span className="pagelist__tag">비고정</span>
            <b>INODE (추가)</b>
            <span>
              한 장에 담을 수 있는 세그먼트가 80여 개다. 그보다 많아지면 빈
              자리에 만든 뒤 앞 페이지와 링크로 잇는다
            </span>
          </li>
          <li>
            <span className="pagelist__tag">비고정</span>
            <b>SDI (추가)</b>
            <span>
              컬럼이 많아 정의가 길면 빈 자리를 받아 B+tree 로 잇는다. 값 하나가
              아주 길면 오버플로 페이지(SDI_BLOB)로 밀려난다
            </span>
          </li>
        </ul>
        <br />
        <p>
          행이 하나도 없는 빈 테이블의 <code>.ibd</code> 파일도 관리용 페이지로
          인해 0 byte 가 아니라 100KB 안팎이다.
        </p>
        <Sub title="FSP_HDR · XDES">
          <p>
            0번은 파일 전체의 머리말이기도 하다. 파일이 지금 몇 페이지인지,
            어디까지 초기화했는지에 대한 정보와 <b>FREE</b> / <b>FREE_FRAG</b> /{" "}
            <b>FULL_FRAG</b> 목록에 대한 XDES entry 주소 등 관리에 필요한
            데이터가 저장되어 있다.
          </p>
          <p>
            그 뒤로는 익스텐트 하나씩 <b>XDES entry</b> 가 256개 붙는다.
            하나에는 이 익스텐트를 어느 세그먼트가 갖고 있는지와, 안에 든 64
            페이지가 각각 찼는지 비었는지가 적혀 있다.
          </p>
          <p>
            해당 파일은 256개의 익스텐드에 대한 정보를 담고 있으므로{" "}
            <b>256MB(16384 페이지)</b>에 대한 정보를 저장할 수 있고, 파일이
            그보다 커지면 <b>16384 페이지</b> 간격으로 XDES 와 IBUF_BITMAP 한
            쌍이 또 생긴다.
          </p>

          <Figure>
            <div className="fsp">
              <div className="fsp__page">
                <span className="fsp__page-name">0번 페이지 — 16KB</span>

                <div className="fsp__head">
                  <b>
                    머리말<em>112 byte · 유효한 값은 0번만 존재.</em>
                  </b>
                  <ul className="fsp__head-list">
                    <li>
                      <span>FSP_SIZE</span>
                      <i>4</i>
                      <em>파일에 물리적으로 확보된 페이지 수</em>
                    </li>
                    <li>
                      <span>FSP_FREE_LIMIT</span>
                      <i>4</i>
                      <em>FREE 목록에 한 번도 올리지 않은 첫 페이지의 번호</em>
                    </li>
                    <li className="is-list">
                      <span>FREE</span>
                      <i>16</i>
                      <em>
                        아무도 쓰지 않는 빈 익스텐트 · 개수 4 · 머리 6 · 꼬리 6
                      </em>
                    </li>
                    <li className="is-list">
                      <span>FREE_FRAG</span>
                      <i>16</i>
                      <em>
                        여러 세그먼트가 낱장으로 나눠 쓰는 중, 빈 장이 남음 ·
                        개수 4 · 머리 6 · 꼬리 6
                      </em>
                    </li>
                    <li className="is-list">
                      <span>FULL_FRAG</span>
                      <i>16</i>
                      <em>
                        낱장으로 다 나가 빈 장이 없음 · 개수 4 · 머리 6 · 꼬리 6
                      </em>
                    </li>
                    <li className="is-list">
                      <span>INODE 페이지 목록</span>
                      <i>32</i>
                      <em>자리 남은 것 · 꽉 찬 것 두 줄</em>
                    </li>
                    <li>
                      <span>다음 세그먼트 번호</span>
                      <i>8</i>
                      <em>세그먼트를 새로 만들 때 떼어 줄 번호</em>
                    </li>
                    <li>
                      <span>그 밖</span>
                      <i>16</i>
                      <em>스페이스 ID · 플래그 등</em>
                    </li>
                  </ul>
                </div>

                <div className="fsp__table">
                  <b>
                    XDES entry<em>익스텐트 정보 · 40 byte × 256 = 10KB</em>
                  </b>
                  <ul className="fsp__head-list">
                    <li>
                      <span>주인 세그먼트 번호</span>
                      <i>8</i>
                      <em>
                        익스텐트를 통째로 가져간 세그먼트의 번호. 주인이 없으면
                        0
                      </em>
                    </li>
                    <li className="is-list">
                      <span>앞 · 뒤 주소</span>
                      <i>12</i>
                      <em>
                        같은 목록에 든 앞 · 뒤 익스텐트. 주소 하나는 페이지 번호
                        4 · 오프셋 2. 주인이 없으면 머리말의 목록, 있으면 그
                        세그먼트의 목록으로 이어진다
                      </em>
                    </li>
                    <li>
                      <span>상태</span>
                      <i>4</i>
                      <em>
                        숫자 하나. 1 FREE · 2 FREE_FRAG · 3 FULL_FRAG · 4
                        FSEG(세그먼트 소유)
                      </em>
                    </li>
                    <li>
                      <span>페이지 비트</span>
                      <i>16</i>
                      <em>
                        페이지 하나당 2비트 × 64. 첫 비트만 쓴다 — 1이면 빈
                        페이지, 0이면 쓰는 중
                      </em>
                    </li>
                  </ul>
                </div>

                <div className="fsp__spare">남는 자리 — 약 5.8KB</div>
              </div>
            </div>
          </Figure>
          <div className="note">
            <b>작은 테이블스페이스의 예외 — 0번 익스텐트만 존재하는 경우</b>
            <p>
              <b>일반적인 경우</b> <code>FSP_FREE_LIMIT ≤ FSP_SIZE</code> 가
              성립한다. <br />
              익스텐트를 FREE 목록에 올리려면 그 64장이 실제 파일 안에 있어야
              하므로, <code>FSP_FREE_LIMIT</code> 이 <code>FSP_SIZE</code> 를
              넘을 수 없다.
            </p>
            <p>
              <b>작은 테이블스페이스의 경우</b> 테이블스페이스를 생성 시 0번
              익스텐드가 필요하기에 미리 초기화하여 <code>FSP_FREE_FRAG</code>{" "}
              목록에 올려두므로, <code>FSP_FREE_LIMIT</code> 은 처음부터 64가
              된다. 반면 실제 파일은 1MB(64장)가 아닌 헤더·비트맵·inode·인덱스
              루트 같은 필수 페이지만큼만 만든다. 작은 테이블마다 1MB씩 차지하면
              공간 낭비가 크기 때문이다. 그래서 이 구간에서는{" "}
              <code>FSP_SIZE &lt; FSP_FREE_LIMIT</code> 인 역전 상태가 된다.
            </p>
            <p>
              <b>공간 예약 함수</b> <br />
              테이블스페이스가 64장 미만인 경우 익스텐트 단위의 공간 예약 함수{" "}
              <code>fsp_reserve_free_extents</code> 대신 페이지 단위 공간 예약
              함수 <code>fsp_reserve_free_pages</code> 가 호출된다.
            </p>
          </div>
        </Sub>
        <Sub title="IBUF_BITMAP">
          <p>
            체인지 버퍼는 메모리에 없는 세컨더리 인덱스 페이지의 변경을 모아
            뒀다가 나중에 합친다. 이 방식(이하 병합)에는{" "}
            <b>페이지를 읽지 않고는 알 수 없는 것</b>이 두 가지 있고,
            IBUF_BITMAP 이 그 답을 미리 저장한다.
          </p>
          <ol className="doc-steps">
            <li>
              <b>공간이 충분한가</b> — 병합은 페이지 하나 안에서 끝나야 하므로
              페이지 분할을 일으키면 안 된다. 그래서 버퍼링 전에 대상 페이지의
              남은 공간을 확인하고, 모자라면 버퍼링을 포기한다. 남은 공간은
              2비트(0~3)로 거칠게 기록하며, 실제보다 작게 보는 하한값이라 판단은
              늘 안전한 쪽으로 기운다.
              <p className="note">
                <b>참고</b> — 16KB 페이지 기준 0은 512B 미만, 1은 512B 이상, 2는
                1KB 이상, 3은 2KB 이상이다. 15KB가 비어 있어도 2KB로 취급되므로,
                한 페이지 앞으로 쌓을 수 있는 변경은 약 2KB가 상한이다.
              </p>
            </li>
            <li>
              <b>합칠 변경이 있는가</b> — 체인지 버퍼는 시스템 테이블스페이스에
              있는 B+Tree라, 페이지를 읽을 때마다 직접 탐색하면 비효율적이다.
              변경이 쌓여 있는지를 비트 하나로 기록해 두고, 켜져 있을 때만
              탐색해 병합한다.
            </li>
          </ol>
          <p>
            이를 위해 구간 안의 페이지마다 <b>4비트</b>씩을 둔다. 한 장이 16384
            페이지를 맡으니 16384 × 4비트 = 8KB 다.
          </p>

          <Figure>
            <div className="fsp">
              <div className="fsp__page">
                <span className="fsp__page-name">1번 페이지 — 16KB</span>
                <div className="fsp__table">
                  <b>
                    페이지당 4bits
                    <em>4bits × 16384 = 8KB</em>
                  </b>
                  <ul className="fsp__head-list fsp__head-list--wide">
                    <li>
                      <span>IBUF_BITMAP_FREE</span>
                      <i>2</i>
                      <em>
                        그 페이지에 남은 공간을 0 ~ 3 네 단계로 기록. 2KB 이상은
                        3, 1KB 이상은 2, 512B 이상은 1, 그외에는 0으로 기록한다.
                      </em>
                    </li>
                    <li>
                      <span>IBUF_BITMAP_BUFFERED</span>
                      <i>1</i>
                      <em>체인지 버퍼에 이 페이지에 대한 변경 여부 기록</em>
                    </li>
                    <li>
                      <span>IBUF_BITMAP_IBUF</span>
                      <i>1</i>
                      <em>해당 페이지가 체인지 버퍼 페이지 여부 기록</em>
                    </li>
                  </ul>
                </div>
                <div className="fsp__spare">남는 자리 — 약 8KB</div>
              </div>
            </div>
          </Figure>
        </Sub>
        <Sub title="INODE">
          <p>
            세그먼트에 대한 정보를 기록하는 엔트리이다. <br />
            엔트리마다 <b>FREE</b> · <b>NOT_FULL</b>· <b>FULL</b> 목록과,
            익스텐트를 할당 받기 전 낱장으로 쓰는 조각 페이지 32자리가 들어
            있다.
          </p>
          <p>
            엔트리가 192 byte 라 한 장에 85개가 들어간다. 인덱스 하나가 논리프 ·
            리프 두 세그먼트를 쓰므로 인덱스 40여 개가 한 장의 한계다. 그보다
            많아지면 빈 자리에 한 장을 더 만들어 링크로 잇는다.
          </p>

          <Figure>
            <div className="cmp">
              <div className="cmp__panel">
                <b>
                  INODE entry<em>세그먼트 하나 · 192 byte</em>
                </b>
                <ul className="cmp__fields">
                  <li>
                    <span>세그먼트 번호</span>
                    <i>8</i>
                    <em>XDES entry 의 주인 번호와 같은 값</em>
                  </li>
                  <li>
                    <span>NOT_FULL 익스텐트에서 쓴 페이지 수</span>
                    <i>4</i>
                  </li>
                  <li>
                    <span>FREE 목록</span>
                    <i>16</i>
                    <em>
                      받아 두고 아직 한 장도 안 쓴 익스텐트 · 개수 4 · 머리 6 ·
                      꼬리 6
                    </em>
                  </li>
                  <li>
                    <span>NOT_FULL 목록</span>
                    <i>16</i>
                    <em>일부만 쓴 익스텐트. 새 장은 여기서 먼저 꺼낸다</em>
                  </li>
                  <li>
                    <span>FULL 목록</span>
                    <i>16</i>
                    <em>64장을 다 쓴 익스텐트</em>
                  </li>
                  <li>
                    <span>검증용 고정값</span>
                    <i>4</i>
                  </li>
                  <li>
                    <span>FSEG_FRAG_ARR</span>
                    <i>128</i>
                    <em>
                      익스텐트 없이 낱장으로 가진 페이지(조각 페이지)의 번호를
                      4bytes씩 32칸에 기록한다. 빈칸은 <b>FIL_NULL</b>
                      (0xFFFFFFFF)로 표시한다.
                    </em>
                  </li>
                </ul>
              </div>
            </div>
          </Figure>
        </Sub>
        <Sub title="페이지 할당" id="page-alloc">
          <p>
            B+tree는 분할 등으로 새 페이지가 필요하면 리프 · 논리프 중 해당하는
            세그먼트를 지정해 요청한다.
          </p>
          <p>
            할당 위치는 세그먼트의 <b>크기</b>로 정해진다. 작을 때는 여러
            세그먼트가 나눠 쓰는 익스텐트(FREE_FRAG)에서 할당 받고, 32장
            이후로는 익스텐트를 통째로 받아 그 안을 채운다.
          </p>

          <Figure>
            <div className="lifecycle">
              {LIFECYCLE.map((stage) => (
                <div key={stage.title} className="lifecycle__stage">
                  <b>
                    {stage.title}
                    <em>{stage.pages}</em>
                  </b>
                  {stage.extents.map((extent) => (
                    <div key={extent.name} className="lifecycle__extent">
                      <span>{extent.name}</span>
                      <Cells owner={extent.cells} />
                    </div>
                  ))}
                  <p>{stage.note}</p>
                </div>
              ))}
              <div className="lifecycle__legend">
                <span>
                  <i className="is-mine" /> 이 세그먼트
                </span>
                <span>
                  <i className="is-other" /> 다른 세그먼트
                </span>
                <span>
                  <i /> 빈 페이지
                </span>
              </div>
            </div>
          </Figure>

          <Figure caption="페이지 한 장을 받는 순서. 경로 정하기는 항상 돌고, 그 아래는 조건이 맞는 칸만 돈다.">
            <SeqDiagram rows={SEQ_ALLOC} />
          </Figure>
        </Sub>
        <Sub title="SDI">
          <p>
            8.0 부터 테이블의 컬럼과 인덱스 구성이 <code>.ibd</code> 안에 JSON
            으로 저장된다. 8.0 이전에는 이 정보가 <code>.frm</code> 파일과
            시스템 테이블스페이스에 흩어져 있었다.
          </p>
          <p>
            덕분에 파일 하나만 있으면 구조까지 복원할 수 있다.{" "}
            <code>ibd2sdi users.ibd</code> 로 꺼내 볼 수 있고, 테이블스페이스를
            다른 서버로 옮기는 작업이 가능한 것도 이것 때문이다.
          </p>
          <p>
            3번은 이 JSON 을 담은 작은 B+tree 의 루트다. 컬럼이 많아 한 장에 다
            들어가지 않으면 빈 자리를 받아 트리를 늘린다. 이 자리는 정해져 있지
            않아 목록에서 <b>비고정</b>으로 표시했다.
          </p>
        </Sub>
      </Block>

      <Block title="파일 사이즈">
        <p>
          FSP_HDR 의 FREE 목록이 비면 파일을 늘려 새 익스텐트를 만든다. 한 번에
          늘리는 크기는 파일 크기에 따라 다르다.
        </p>
        <ul className="doc-steps">
          <li>
            <b>32 익스텐트(32MB) 미만</b> — 익스텐트 1개(1MB)씩 늘린다. 작은
            테이블이 필요 이상으로 큰 파일을 차지하지 않게 하기 위해서다.
          </li>
          <li>
            <b>32 익스텐트(32MB) 이상</b> — 익스텐트 4개(4MB)씩 늘린다.
          </li>
        </ul>
        <br />
        <p>
          여러 개씩 늘리는 이유는 파일을 늘리는 작업이 비싸기 때문이다. 파일을
          늘리려면 OS 에 요청해 디스크 공간을 새로 확보해야 하고, 그동안 같은
          파일에서 새 페이지를 요청하는 다른 작업은 멈춰서 기다린다. 반면 이미
          늘려 둔 파일 안에서 익스텐트를 받는 것은 FSP_HDR 의 목록과 XDES entry
          값을 수정하는 것으로 처리할 수 있다. 그래서 비싼 작업을 한 번에
          처리하는 것이다.
        </p>
        <p>
          위와 같은 동작으로 <b>FREE</b>익스텐드가 여러개 생성될 수 있고 이를
          리스트로 관리하는 것이다.
        </p>
        <p>
          또한 데이터를 지워도 그 공간은 OS 에 반환되지 않고, 비워진 페이지는 빈
          페이지로 표시되고, 익스텐트는 상태에 맞는 리스트로 옮겨져 재사용된다.
          그래서 대량 DELETE 후에도 파일 사이즈는 그대로이며, 파일 크기를
          줄이려면 테이블을 다시 쓰는 명령어를 통해 해결해야 한다.
        </p>
      </Block>

      <Block title="다른 테이블스페이스들">
        <Sub title="Undo Tablespaces">
          <p>
            <code>undo_001</code> · <code>undo_002</code>. 롤백과 MVCC 가 쓰는
            undo 로그가 여기 들어간다. 테이블 데이터와 성격이 달라 파일을 나눠
            두었고, 8.0 부터는 크기가 커지면 잘라내는 작업이 자동으로 돈다.
          </p>
        </Sub>
        <Sub title="System Tablespace">
          <p>
            <code>ibdata1</code>. 체인지 버퍼의 B+Tree 가 여기 저장된다. 8.0
            이전에는 데이터 딕셔너리도 여기 있었지만 8.0 부터{" "}
            <code>mysql.ibd</code> 로 옮겨졌다.
          </p>
        </Sub>
        <Sub title="Temporary Tablespaces">
          <p>
            임시 테이블이 디스크로 내려갈 때 쓴다. 세션마다 빌려 쓰는{" "}
            <code>#innodb_temp/temp_N.ibt</code> 와, 그 변경의 undo 를 담는{" "}
            <code>ibtmp1</code> 로 나뉜다. 재시작할 때마다 새로 만들어지며, redo
            를 남기지 않는다 — 임시 테이블은 복구 대상이 아니기 때문이다.
          </p>
        </Sub>
        <Note>
          이 시뮬레이터는 file-per-table 구성만 다룬다. 관리용 페이지와 파일
          오프셋은 모델링하지 않고, undo 는 파일이 아니라 메모리상의 목록으로만
          관리한다.
        </Note>
      </Block>
    </>
  );
}

type SeqActor = "seg" | "inode" | "xdes" | "fsp";

const SEQ_ACTORS: { id: SeqActor; name: string; sub?: string }[] = [
  { id: "seg", name: "B+tree", sub: "분할 등으로 한 장이 필요" },
  { id: "inode", name: "INODE entry", sub: "요청한 세그먼트" },
  { id: "xdes", name: "XDES entry", sub: "0번 · 16384번 …" },
  { id: "fsp", name: "FSP_HDR", sub: "0번 머리말" },
];

const actorIndex = (id: SeqActor) =>
  SEQ_ACTORS.findIndex((actor) => actor.id === id);

type SeqRow =
  // `branch` opens a boxed region that runs until the next branch; only one region runs per call.
  // `boxed` draws a smaller box around this frame and that many rows after it, for a step that
  // only sometimes runs.
  | { frame: string; when?: string; branch?: string; boxed?: number }
  | { fork: { label: string; to: string }[]; note?: string }
  | {
      from: SeqActor;
      to: SeqActor;
      label: string;
      reply?: boolean;
      note?: string;
    };

/**
 * One allocation, branching on the fragment array: a segment with a free slot borrows a single
 * page from a shared extent; one with all 32 used fills extents it owns, taking a new one when out.
 */
const SEQ_ALLOC: SeqRow[] = [
  {
    from: "seg",
    to: "inode",
    label: "FSEG_FRAG_ARR 빈 칸 확인",
    note: "INODE entry를 확인하여 FSEG_FRAG_ARR에 빈칸 여부를 확인한다.",
  },
  {
    from: "inode",
    to: "seg",
    label: "빈 칸 유무",
    reply: true,
  },
  {
    fork: [
      { label: "빈 칸 있음", to: "A" },
      { label: "32칸 모두 참", to: "B" },
    ],
    note: "남은 조각 페이지 여부에 따라 분기된다.",
  },
  {
    frame: "FREE_FRAG에서 페이지 할당",
    when: "빈 칸이 있을 때 — 작은 세그먼트",
    branch: "A",
  },
  {
    from: "seg",
    to: "fsp",
    label: "FREE_FRAG 익스텐트 하나 요청",
    note: "FREE_FRAG — 여러 세그먼트가 한 장씩 나눠 쓰는 익스텐트들",
  },
  {
    from: "fsp",
    to: "seg",
    label: "익스텐트 주소 · 없음",
    reply: true,
    note: "FREE_FRAG 목록이 비었으면 없음. 이때만 아래 칸을 돈다",
  },
  {
    frame: "FREE_FRAG 익스텐트 만들기",
    when: "FREE_FRAG 목록이 비었을 때만",
    boxed: 4,
  },
  {
    from: "seg",
    to: "fsp",
    label: "FREE 익스텐트 하나 요청",
    note: "FSP_HDR 의 FREE — 아직 아무도 쓰지 않는 익스텐트",
  },
  {
    from: "fsp",
    to: "seg",
    label: "익스텐트 주소",
    reply: true,
    note: "FREE 목록에서 떼어 낸 익스텐트",
  },
  {
    from: "seg",
    to: "xdes",
    label: "상태 = FREE_FRAG",
    note: "주인은 적지 않는다. 여러 세그먼트가 한 장씩 나눠 쓴다",
  },
  {
    from: "seg",
    to: "fsp",
    label: "FREE_FRAG 목록에 붙이기",
    note: "다음에 낱장을 빌리는 세그먼트도 이 익스텐트를 쓴다",
  },
  {
    from: "seg",
    to: "xdes",
    label: "빈 페이지 하나 요청",
    note: "페이지 비트에서 빈 페이지를 찾아 사용 중으로 바꾼다. 익스텐트의 주인은 계속 없음",
  },
  {
    from: "xdes",
    to: "seg",
    label: "페이지 번호",
    reply: true,
    note: "익스텐트의 첫 페이지 번호 + 찾은 비트의 위치",
  },
  {
    from: "seg",
    to: "inode",
    label: "FSEG_FRAG_ARR 빈 칸에 페이지 번호 적기",
    note: "이 장이 내 것이라는 기록은 여기에만 남는다",
  },
  {
    from: "seg",
    to: "fsp",
    label: "다 찼으면 FREE_FRAG → FULL_FRAG",
    note: "FULL_FRAG — 64장이 모두 낱장으로 나가 더 빌려 줄 게 없다",
  },
  {
    frame: "자기 익스텐트에서 찾기",
    when: "32칸이 모두 찼을 때 — 큰 세그먼트",
    branch: "B",
  },
  {
    from: "seg",
    to: "inode",
    label: "NOT_FULL, 없으면 FREE 목록 머리",
    note: "쓰다 만 익스텐트부터 채워야 페이지가 흩어지지 않는다",
  },
  {
    from: "inode",
    to: "seg",
    label: "익스텐트 주소 · 없음",
    reply: true,
    note: "두 목록이 모두 비었으면 없음. 이때만 아래 칸을 돈다",
  },
  {
    frame: "새 익스텐트 받기",
    when: "자기 익스텐트에 빈 장이 없을 때만",
    boxed: 4,
  },
  {
    from: "seg",
    to: "fsp",
    label: "FREE 익스텐트 하나 요청",
    note: "FSP_HDR 의 FREE — 아직 아무도 쓰지 않는 익스텐트",
  },
  {
    from: "fsp",
    to: "seg",
    label: "익스텐트 주소",
    reply: true,
    note: "FREE 목록에서 떼어 낸 익스텐트",
  },
  {
    from: "seg",
    to: "xdes",
    label: "주인 = 이 세그먼트 · 상태 = FSEG",
    note: "이제 이 익스텐트는 이 세그먼트만 쓴다",
  },
  {
    from: "seg",
    to: "inode",
    label: "세그먼트의 FREE 목록에 붙이기",
    note: "막 받아 비어 있으니 FREE",
  },
  {
    from: "seg",
    to: "xdes",
    label: "빈 페이지 하나 요청",
    note: "페이지 비트에서 빈 페이지를 찾아 사용 중으로 바꾼다. 내 익스텐트라 다른 세그먼트와 섞이지 않는다",
  },
  {
    from: "xdes",
    to: "seg",
    label: "페이지 번호",
    reply: true,
    note: "이 번호의 페이지를 B+tree 가 받아 쓴다",
  },
  {
    from: "seg",
    to: "inode",
    label: "FREE → NOT_FULL → FULL 옮기기",
    note: "첫 장을 쓰면 NOT_FULL 로, 64장이 다 차면 FULL 로. FULL 은 할당할 때 다시 보지 않는다",
  },
];

function SeqDiagram({ rows }: { rows: SeqRow[] }) {
  // Each branch frame owns the rows down to the next branch frame (or the end).
  const starts = rows.flatMap((row, r) =>
    "frame" in row && row.branch ? [r] : [],
  );
  const regions = starts.map((start, i) => ({
    start,
    end: starts[i + 1] ?? rows.length,
  }));
  const inner = rows.flatMap((row, r) =>
    "frame" in row && row.boxed ? [{ start: r, end: r + 1 + row.boxed }] : [],
  );
  // The row right under a dashed box needs air, or its text touches the box's border.
  const afterBox = new Set(inner.map(({ end }) => end));
  return (
    <div
      className="seq"
      style={{
        gridTemplateColumns: `repeat(${SEQ_ACTORS.length * 2}, minmax(0, 1fr)) minmax(0, 3.6fr)`,
      }}
    >
      {SEQ_ACTORS.map((actor, i) => (
        <div
          key={actor.id}
          className={`seq__actor${actor.id === "seg" ? " seq__actor--caller" : ""}`}
          style={{ gridColumn: `${i * 2 + 1} / span 2` }}
        >
          <b>{actor.name}</b>
          {actor.sub && <em>{actor.sub}</em>}
        </div>
      ))}
      <span className="seq__note-head">설명</span>
      {SEQ_ACTORS.map((actor, i) => (
        <span
          key={actor.id}
          className="seq__life"
          style={{
            gridColumn: `${i * 2 + 1} / span 2`,
            gridRow: `2 / ${rows.length + 2}`,
          }}
        />
      ))}
      {regions.map(({ start, end }) => (
        <span
          key={`region-${start}`}
          className="seq__region"
          style={{ gridRow: `${start + 2} / ${end + 2}` }}
        />
      ))}
      {inner.map(({ start, end }) => (
        <span
          key={`inner-${start}`}
          className="seq__region seq__region--inner"
          style={{ gridRow: `${start + 2} / ${end + 2}` }}
        />
      ))}
      {rows.map((row, r) => {
        const gridRow = r + 2;
        if ("frame" in row) {
          return (
            <div
              key={r}
              className={`seq__frame${row.branch ? " seq__frame--branch" : ""}${row.boxed ? " seq__frame--boxed" : ""}`}
              style={{ gridRow }}
            >
              {row.branch && <i className="seq__tag">{row.branch}</i>}
              <b>{row.frame}</b>
              {row.when && <em>{row.when}</em>}
            </div>
          );
        }
        if ("fork" in row) {
          return [
            <div key={r} className="seq__fork" style={{ gridRow }}>
              {row.fork.map((way) => (
                <span key={way.to}>
                  {way.label} → <i className="seq__tag">{way.to}</i>
                </span>
              ))}
            </div>,
            row.note && (
              <span key={`${r}-note`} className="seq__note" style={{ gridRow }}>
                {row.note}
              </span>
            ),
          ];
        }
        const from = actorIndex(row.from);
        const to = actorIndex(row.to);
        // A label running right into the last lifeline would spill past the figure.
        const endAligned = to > from && to === SEQ_ACTORS.length - 1;
        return [
          <div
            key={r}
            className={`seq__msg seq__msg--${to > from ? "right" : "left"}${endAligned ? " seq__msg--end" : ""}${row.reply ? " seq__msg--reply" : ""}${afterBox.has(r) ? " seq__gap" : ""}`}
            style={{
              gridRow,
              gridColumn: `${Math.min(from, to) * 2 + 2} / ${Math.max(from, to) * 2 + 2}`,
            }}
          >
            {row.label}
          </div>,
          row.note && (
            <span
              key={`${r}-note`}
              className={`seq__note${afterBox.has(r) ? " seq__gap" : ""}`}
              style={{ gridRow }}
            >
              {row.note}
            </span>
          ),
        ];
      })}
    </div>
  );
}

/** Who holds each of an extent's 64 pages: this segment, another one, or nobody yet. */
type CellOwner = "mine" | "other" | "free";

/** 64 cells built from runs, so the stages below can be written as a few counts. */
const cells = (...runs: [CellOwner, number][]): CellOwner[] => {
  const out = runs.flatMap(([owner, n]) => Array<CellOwner>(n).fill(owner));
  return [...out, ...Array<CellOwner>(64 - out.length).fill("free")];
};

/** A shared fragment extent: the first `used` pages are taken, this segment's scattered among them. */
const shared = (mine: number[], used: number): CellOwner[] =>
  Array.from({ length: 64 }, (_, i) =>
    mine.includes(i) ? "mine" : i < used ? "other" : "free",
  );

const LIFECYCLE: {
  title: string;
  pages: string;
  extents: { name: string; cells: CellOwner[] }[];
  note: string;
}[] = [
  {
    title: "처음",
    pages: "1 ~ 32장",
    extents: [
      {
        name: "공용 익스텐트",
        cells: shared([4, 5, 11, 17, 20, 26, 29, 35], 40),
      },
    ],
    note: "FREE_FRAG 익스텐트에서 한 장씩 빌린다. 다른 세그먼트와 섞여 흩어지고, 번호는 INODE 조각 자리에 적힌다",
  },
  {
    title: "33장째",
    pages: "조각 32자리가 다 참",
    extents: [
      {
        name: "공용 익스텐트",
        cells: shared([4, 5, 11, 17, 20, 26, 29, 35], 40),
      },
      { name: "내 익스텐트", cells: cells(["mine", 1]) },
    ],
    note: "FREE 익스텐트 하나를 통째로 받아 주인이 된다. 빌린 32장은 그대로 둔다",
  },
  {
    title: "그 뒤",
    pages: "97장째 …",
    extents: [
      { name: "내 익스텐트", cells: cells(["mine", 64]) },
      { name: "내 익스텐트", cells: cells(["mine", 1]) },
    ],
    note: "자기 익스텐트를 앞에서부터 채우고, 다 차면 또 하나를 받는다",
  },
];

function Cells({ owner }: { owner: CellOwner[] }) {
  return (
    <span className="lifecycle__cells" aria-hidden>
      {owner.map((o, i) => (
        <i key={i} className={o === "free" ? undefined : `is-${o}`} />
      ))}
    </span>
  );
}

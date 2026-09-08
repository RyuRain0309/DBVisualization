export function LockLegend() {
  return (
    <section className="panel">
      <header className="panel__header">
        <h2>트리 위 표시 읽는 법</h2>
      </header>

      <ul className="legend">
        <li>
          <span className="legend__swatch legend__swatch--x">X</span>
          레코드에 걸린 배타 락. 그 행을 다른 트랜잭션이 읽지도 쓰지도 못한다.
        </li>
        <li>
          <span className="legend__swatch legend__swatch--s">S</span>
          레코드에 걸린 공유 락. 다른 S 락과는 공존하지만 X 락은 대기한다.
        </li>
        <li>
          <span className="legend__swatch legend__swatch--gap" />
          레코드 앞 갭. 이 사이에 새 행을 끼워 넣는 것을 막는다. 레코드 배지와 갭 표시가 함께 있으면
          넥스트키 락이다.
        </li>
        <li>
          <span className="legend__swatch legend__swatch--intention" />
          삽입 의도 락. 같은 갭을 노리는 다른 삽입과는 충돌하지 않는다.
        </li>
      </ul>

      <p className="panel__note">
        마지막 리프 오른쪽 끝에 붙는 표시는 supremum 갭이다. 인덱스 끝 뒤에 행이 붙는 것을 막는다.
      </p>
    </section>
  );
}

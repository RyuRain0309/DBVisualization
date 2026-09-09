# InnoDB Visualizer

SQL을 입력하면 InnoDB가 내부적으로 무엇을 하는지 단계별로 보여주는 학습용 웹앱이다.
실제 MySQL에 붙지 않고, 브라우저 안에서 도는 자체 시뮬레이터가 B+tree·락·redo/undo 로그를 직접 모델링한다.

## 보여주는 것

- **B+tree 구조 변화** — 클러스터드 인덱스와 세컨더리 인덱스를 따로 그린다. 리프 페이지에 행 전체가 들어가는지 PK만 들어가는지, 페이지 분할·병합이 언제 일어나는지 보인다.
- **락** — 레코드 락 / 갭 락 / 넥스트키 락 / 테이블 의도 락을 목록으로도 보여주고, 잠긴 위치를 트리 위에 직접 표시한다.
- **redo / undo 로그** — 페이지 변경마다 쌓이는 redo가 커밋 시점에 디스크로 내려가는 과정, undo가 롤백과 MVCC 버전 체인에 동시에 쓰이는 과정.
- **격리수준 차이** — 같은 SQL을 격리수준만 바꿔 실행하면 갭 락 사용 여부와 read view 수명이 달라진다.
- **세션 간 경합** — 콘솔을 여러 개 열면 각각이 연결 하나다. 같은 행을 건드리면 한쪽이 락을 기다리고, 블로커가 커밋하면 대기 중이던 문장이 자동으로 이어서 실행된다. 대기가 순환하면 데드락으로 감지해 한쪽을 롤백한다.

모든 단계에는 "왜 이 일이 일어났는지" 한 줄 설명이 붙고, 슬라이더로 앞뒤로 이동하면 그 시점 상태가 그대로 다시 그려진다.

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 엔진 단위 테스트
```

## 지원하는 SQL

`CREATE TABLE`(PRIMARY KEY / KEY), `INSERT`, `UPDATE`, `DELETE`, `SELECT`(`FOR UPDATE`, `LOCK IN SHARE MODE`),
`BEGIN` / `COMMIT` / `ROLLBACK`, `SET TRANSACTION ISOLATION LEVEL`.

WHERE 절은 AND로 연결된 단일 컬럼 비교만 지원한다. JOIN·서브쿼리·OR·IN·LIKE는 조용히 잘못 해석하는 대신 에러로 알려준다.

## 단순화한 부분

교육용으로 일부러 줄인 것들이며 화면에도 표시한다.

- 페이지 용량이 기본 4건이다. 실제 InnoDB 페이지는 16KB로 수백 건을 담지만, 그러면 분할이 눈에 보이지 않는다.
- redo 로그는 실제 물리 포맷 대신 읽을 수 있는 설명으로 기록하고, `innodb_flush_log_at_trx_commit` 설정 없이 항상 커밋 시점에 flush한다.
- purge는 백그라운드가 아니라 활성 트랜잭션이 하나도 없을 때 커밋 직후에 돈다.
- 락 대기에 타임아웃이 없다. 실제로는 `innodb_lock_wait_timeout`(기본 50초)이 지나면 에러가 난다.

## 구조

- `src/engine/**` — 순수 TypeScript 시뮬레이터. React/DOM 의존성이 없어 단위 테스트로 동작을 검증한다.
  - `sql/` 토크나이저·파서, `btree/` B+tree와 인덱스, `locks/` 락 매니저와 락 계산, `logs/` redo·undo, `mvcc/` read view와 버전 체인, `executor/` 문장 실행과 StepEvent, `transaction/` 공유 Database와 연결별 Session
- `src/components/**` — 화면. SVG로 트리를 그리고 각 패널이 스냅샷을 표시한다.
- `src/store/` — 실행 결과(StepEvent + 스냅샷)를 들고 있는 zustand 스토어.

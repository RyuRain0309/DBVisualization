import type { EngineSnapshot } from '../../engine/executor/events';
import { useEngineStore } from '../../store/engineStore';
import { SessionConsole } from './SessionConsole';

const SCENARIOS: { label: string; hint: string; sql: string }[] = [
  {
    label: '테이블 + 데이터',
    hint: '세컨더리 인덱스까지 만들고 행 3개를 넣는다',
    sql: `CREATE TABLE users (
  id INT NOT NULL,
  name VARCHAR(20),
  email VARCHAR(30),
  PRIMARY KEY (id),
  KEY idx_email (email)
);
INSERT INTO users VALUES (10, 'a', 'a@x.com');
INSERT INTO users VALUES (20, 'b', 'b@x.com');
INSERT INTO users VALUES (30, 'c', 'c@x.com');`,
  },
  {
    label: '페이지 분할',
    hint: '페이지 용량을 넘겨 리프를 쪼갠다',
    sql: `INSERT INTO users VALUES (40, 'd', 'd@x.com');
INSERT INTO users VALUES (50, 'e', 'e@x.com');`,
  },
  {
    label: '갭 락',
    hint: '없는 키를 지워도 갭이 잠긴다',
    sql: `BEGIN;
DELETE FROM users WHERE id = 25;`,
  },
  {
    label: '넥스트키 락',
    hint: '범위 스캔이 훑은 레코드를 모두 잠근다',
    sql: `BEGIN;
UPDATE users SET name = 'z' WHERE id > 15;`,
  },
  {
    label: '락 대기',
    hint: '다른 세션이 잡은 행을 건드려 본다',
    sql: `BEGIN;
UPDATE users SET name = 'blocked' WHERE id = 20;`,
  },
  {
    label: '롤백',
    hint: 'undo 를 거꾸로 적용해 되돌린다',
    sql: `BEGIN;
DELETE FROM users WHERE id = 30;
ROLLBACK;`,
  },
  {
    label: 'read view 재사용',
    hint: '같은 트랜잭션의 두 SELECT 는 같은 스냅샷을 본다',
    sql: `BEGIN;
SELECT * FROM users WHERE id = 10;
SELECT * FROM users WHERE id = 10;
COMMIT;`,
  },
];

export function ConsoleWorkspace({ snapshot }: { snapshot: EngineSnapshot }) {
  const consoles = useEngineStore((state) => state.consoles);
  const activeConsole = useEngineStore((state) => state.activeConsole);
  const setActiveConsole = useEngineStore((state) => state.setActiveConsole);
  const addConsole = useEngineStore((state) => state.addConsole);
  const setSql = useEngineStore((state) => state.setSql);

  return (
    <div className="consoles">
      <header className="consoles__bar">
        <div>
          <h2>SQL 콘솔</h2>
          <p>
            콘솔 하나가 연결 하나다. 각자 자기 트랜잭션을 열고, 같은 행을 건드리면 서로 락을 기다린다.
          </p>
        </div>
        <button type="button" className="button" onClick={addConsole}>
          + 콘솔 추가
        </button>
      </header>

      <div className="consoles__samples">
        <span className="consoles__samples-label">
          {consoles.find((entry) => entry.sessionId === activeConsole)?.name ?? '콘솔'} 에 넣기
        </span>
        {SCENARIOS.map((scenario) => (
          <button
            key={scenario.label}
            type="button"
            className="button"
            title={scenario.hint}
            onClick={() => setSql(activeConsole, scenario.sql)}
          >
            {scenario.label}
          </button>
        ))}
      </div>

      <div className="consoles__grid">
        {consoles.map((console) => (
          <div
            key={console.sessionId}
            className={`consoles__slot ${
              console.sessionId === activeConsole ? 'consoles__slot--active' : ''
            }`}
            onFocusCapture={() => setActiveConsole(console.sessionId)}
            onClick={() => setActiveConsole(console.sessionId)}
          >
            <SessionConsole
              console={console}
              session={snapshot.sessions.find((entry) => entry.id === console.sessionId)}
              removable={consoles.length > 1}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

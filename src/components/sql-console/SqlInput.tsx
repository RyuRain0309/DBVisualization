import { useState, type KeyboardEvent } from 'react';
import { useEngineStore } from '../../store/engineStore';

const SAMPLES: { label: string; sql: string }[] = [
  {
    label: '1. 테이블 만들기',
    sql: `CREATE TABLE users (
  id INT NOT NULL,
  name VARCHAR(20),
  email VARCHAR(30),
  PRIMARY KEY (id),
  KEY idx_email (email)
);`,
  },
  {
    label: '2. 페이지 분할',
    sql: `INSERT INTO users VALUES (10, 'a', 'a@x.com');
INSERT INTO users VALUES (20, 'b', 'b@x.com');
INSERT INTO users VALUES (30, 'c', 'c@x.com');
INSERT INTO users VALUES (40, 'd', 'd@x.com');
INSERT INTO users VALUES (50, 'e', 'e@x.com');`,
  },
  {
    label: '3. 갭 락',
    sql: `BEGIN;
-- 없는 키를 지워도 REPEATABLE READ 는 갭을 잠근다
DELETE FROM users WHERE id = 25;`,
  },
  {
    label: '4. 넥스트키 락',
    sql: `BEGIN;
UPDATE users SET name = 'z' WHERE id > 15;`,
  },
  {
    label: '5. 세컨더리 인덱스',
    sql: `BEGIN;
UPDATE users SET email = 'zzz@x.com' WHERE id = 30;
COMMIT;`,
  },
  {
    label: '6. 롤백',
    sql: `BEGIN;
DELETE FROM users WHERE id = 20;
ROLLBACK;`,
  },
  {
    label: '7. read view 재사용',
    sql: `BEGIN;
SELECT * FROM users WHERE id = 10;
SELECT * FROM users WHERE id = 10;
COMMIT;`,
  },
  {
    label: '8. SERIALIZABLE 읽기 락',
    sql: `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
BEGIN;
SELECT * FROM users WHERE id = 10;`,
  },
];

export function SqlInput() {
  const run = useEngineStore((state) => state.run);
  const stepwise = useEngineStore((state) => state.stepwise);
  const setStepwise = useEngineStore((state) => state.setStepwise);
  const error = useEngineStore((state) => state.error);
  const [sql, setSql] = useState(SAMPLES[0]!.sql);

  const submit = () => {
    if (sql.trim().length > 0) run(sql);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  };

  return (
    <section className="console">
      <header className="console__header">
        <h2>SQL 콘솔</h2>
        <label className="console__toggle">
          <input
            type="checkbox"
            checked={stepwise}
            onChange={(event) => setStepwise(event.target.checked)}
          />
          한 스텝씩 실행
        </label>
      </header>

      <textarea
        className="console__editor"
        value={sql}
        spellCheck={false}
        onChange={(event) => setSql(event.target.value)}
        onKeyDown={onKeyDown}
      />

      <div className="console__actions">
        <button type="button" className="button button--primary" onClick={submit}>
          실행 <span className="button__hint">⌘↵</span>
        </button>
        {SAMPLES.map((sample) => (
          <button
            key={sample.label}
            type="button"
            className="button"
            onClick={() => setSql(sample.sql)}
          >
            {sample.label}
          </button>
        ))}
      </div>

      {error && <p className="console__error">{error}</p>}
    </section>
  );
}

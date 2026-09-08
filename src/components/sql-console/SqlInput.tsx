import { useState, type KeyboardEvent } from 'react';
import { useEngineStore } from '../../store/engineStore';

const SAMPLES: { label: string; sql: string }[] = [
  {
    label: '테이블 만들기',
    sql: `CREATE TABLE users (
  id INT NOT NULL,
  name VARCHAR(20),
  email VARCHAR(30),
  PRIMARY KEY (id),
  KEY idx_email (email)
);`,
  },
  {
    label: '페이지 분할 보기',
    sql: `INSERT INTO users VALUES (1, 'a', 'a@x.com');
INSERT INTO users VALUES (2, 'b', 'b@x.com');
INSERT INTO users VALUES (3, 'c', 'c@x.com');
INSERT INTO users VALUES (4, 'd', 'd@x.com');
INSERT INTO users VALUES (5, 'e', 'e@x.com');`,
  },
  {
    label: '트랜잭션과 롤백',
    sql: `BEGIN;
UPDATE users SET name = 'changed' WHERE id = 2;
ROLLBACK;`,
  },
  {
    label: '삭제와 purge',
    sql: `DELETE FROM users WHERE id = 3;`,
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

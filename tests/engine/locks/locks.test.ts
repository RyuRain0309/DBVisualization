import { describe, expect, it } from 'vitest';
import type { Lock } from '../../../src/engine/locks/types';
import { Session } from '../../../src/engine/transaction/session';

function run(session: Session, sql: string) {
  const result = session.run(sql);
  if (result.error) throw new Error(result.error);
  return result.steps.map((step) => step.event);
}

function setup(isolation = 'REPEATABLE READ'): Session {
  const session = new Session(4);
  run(session, `SET TRANSACTION ISOLATION LEVEL ${isolation}`);
  run(
    session,
    `CREATE TABLE users (
       id INT NOT NULL,
       name VARCHAR(20),
       email VARCHAR(30),
       PRIMARY KEY (id),
       KEY idx_email (email)
     );`,
  );
  run(session, "INSERT INTO users VALUES (10,'a','a@x'), (20,'b','b@x'), (30,'c','c@x')");
  return session;
}

function locksAfter(session: Session, sql: string): Lock[] {
  run(session, sql);
  return session.lockManager.held();
}

function shapes(locks: Lock[]): string[] {
  return locks.map((lock) =>
    lock.target.granularity === 'TABLE'
      ? `${lock.mode}:TABLE`
      : `${lock.mode}:${lock.target.granularity}:${
          lock.target.key?.join(',') ?? lock.target.gapBeforeKey?.join(',') ?? 'supremum'
        }`,
  );
}

describe('lock plan under REPEATABLE READ', () => {
  it('takes an intention lock on the table before any row lock', () => {
    const session = setup();
    run(session, 'BEGIN');
    const locks = locksAfter(session, "UPDATE users SET name = 'z' WHERE id = 10");

    expect(locks[0]!.target.granularity).toBe('TABLE');
    expect(locks[0]!.mode).toBe('IX');
  });

  it('degrades a next-key lock to a record lock for a unique key that exists', () => {
    const session = setup();
    run(session, 'BEGIN');
    const locks = locksAfter(session, "UPDATE users SET name = 'z' WHERE id = 20");

    expect(shapes(locks)).toEqual(['IX:TABLE', 'X:RECORD:20']);
  });

  it('locks the gap when a unique lookup finds nothing, to keep phantoms out', () => {
    const session = setup();
    run(session, 'BEGIN');
    const locks = locksAfter(session, 'DELETE FROM users WHERE id = 25');

    expect(shapes(locks)).toEqual(['IX:TABLE', 'X:GAP:30']);
  });

  it('uses the supremum gap when the missing key is past the last record', () => {
    const session = setup();
    run(session, 'BEGIN');
    const locks = locksAfter(session, 'DELETE FROM users WHERE id = 99');

    expect(shapes(locks)).toEqual(['IX:TABLE', 'X:GAP:supremum']);
  });

  it('takes next-key locks on every scanned record for a range scan', () => {
    const session = setup();
    run(session, 'BEGIN');
    const locks = locksAfter(session, "UPDATE users SET name = 'z' WHERE id > 15");

    expect(shapes(locks)).toEqual([
      'IX:TABLE',
      'X:NEXT_KEY:10',
      'X:NEXT_KEY:20',
      'X:NEXT_KEY:30',
      'X:GAP:supremum',
    ]);
  });

  it('locks the insert position with an insert intention lock', () => {
    const session = setup();
    run(session, 'BEGIN');
    const locks = locksAfter(session, "INSERT INTO users VALUES (25, 'x', 'x@x')");

    expect(shapes(locks)).toEqual(['IX:TABLE', 'X:INSERT_INTENTION:30', 'X:RECORD:25']);
  });

  it('holds locks until the transaction ends, then releases them all at once', () => {
    const session = setup();
    run(session, 'BEGIN');
    run(session, "UPDATE users SET name = 'z' WHERE id = 20");
    expect(session.lockManager.held().length).toBeGreaterThan(0);

    const events = run(session, 'COMMIT');
    expect(events.find((e) => e.type === 'lock-release')).toMatchObject({ cause: 'COMMIT' });
    expect(session.lockManager.held()).toEqual([]);
  });

  it('releases locks on ROLLBACK too', () => {
    const session = setup();
    run(session, 'BEGIN');
    run(session, 'DELETE FROM users WHERE id = 10');
    run(session, 'ROLLBACK');

    expect(session.lockManager.held()).toEqual([]);
  });
});

describe('lock plan under READ COMMITTED', () => {
  it('never takes gap locks', () => {
    const session = setup('READ COMMITTED');
    run(session, 'BEGIN');
    const locks = locksAfter(session, "UPDATE users SET name = 'z' WHERE id > 15");

    expect(shapes(locks)).toEqual(['IX:TABLE', 'X:RECORD:20', 'X:RECORD:30']);
  });

  it('takes nothing beyond the table lock when a unique lookup misses', () => {
    const session = setup('READ COMMITTED');
    run(session, 'BEGIN');
    const locks = locksAfter(session, 'DELETE FROM users WHERE id = 25');

    expect(shapes(locks)).toEqual(['IX:TABLE']);
  });
});

describe('reads', () => {
  it('takes no locks for a plain SELECT below SERIALIZABLE', () => {
    const session = setup();
    run(session, 'BEGIN');
    const locks = locksAfter(session, 'SELECT * FROM users WHERE id = 10');

    expect(locks).toEqual([]);
  });

  it('turns a plain SELECT into a share-mode locking read under SERIALIZABLE', () => {
    const session = setup('SERIALIZABLE');
    run(session, 'BEGIN');
    const locks = locksAfter(session, 'SELECT * FROM users WHERE id = 10');

    expect(shapes(locks)).toEqual(['IS:TABLE', 'S:RECORD:10']);
  });

  it('takes X locks for SELECT ... FOR UPDATE', () => {
    const session = setup();
    run(session, 'BEGIN');
    const locks = locksAfter(session, 'SELECT * FROM users WHERE id = 10 FOR UPDATE');

    expect(shapes(locks)).toEqual(['IX:TABLE', 'X:RECORD:10']);
  });

  it('takes S locks for LOCK IN SHARE MODE', () => {
    const session = setup();
    run(session, 'BEGIN');
    const locks = locksAfter(session, 'SELECT * FROM users WHERE id = 10 LOCK IN SHARE MODE');

    expect(shapes(locks)).toEqual(['IS:TABLE', 'S:RECORD:10']);
  });
});

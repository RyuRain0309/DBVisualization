import { describe, expect, it } from 'vitest';
import type { StepEvent } from '../../../src/engine/executor/events';
import { Database } from '../../../src/engine/transaction/database';
import type { Session } from '../../../src/engine/transaction/session';

function run(session: Session, sql: string): StepEvent[] {
  return session.run(sql).steps.map((step) => step.event);
}

function setup() {
  const db = new Database(4);
  const a = db.openSession('A');
  const b = db.openSession('B');
  run(a, 'CREATE TABLE t (id INT NOT NULL, v INT, PRIMARY KEY (id))');
  run(a, 'INSERT INTO t VALUES (1, 100), (2, 200), (3, 300)');
  return { db, a, b };
}

function rowsOf(session: Session, sql: string) {
  const returned = run(session, sql).find((event) => event.type === 'rows-returned');
  return returned && returned.type === 'rows-returned' ? returned.rows : [];
}

describe('lock contention between sessions', () => {
  it('parks the second session behind the first session\'s row lock', () => {
    const { a, b } = setup();
    run(a, 'BEGIN');
    run(a, 'UPDATE t SET v = 111 WHERE id = 1');

    run(b, 'BEGIN');
    const events = run(b, 'UPDATE t SET v = 999 WHERE id = 1');

    expect(events.find((event) => event.type === 'lock-wait')).toBeDefined();
    expect(b.isWaiting).toBe(true);
    // Nothing of the blocked statement was applied.
    expect(rowsOf(a, 'SELECT * FROM t WHERE id = 1')[0]).toMatchObject({ v: 111 });
  });

  it('resumes the parked statement as soon as the blocker commits', () => {
    const { a, b } = setup();
    run(a, 'BEGIN');
    run(a, 'UPDATE t SET v = 111 WHERE id = 1');
    run(b, 'BEGIN');
    run(b, 'UPDATE t SET v = 999 WHERE id = 1');

    const events = run(a, 'COMMIT');

    expect(events.find((event) => event.type === 'lock-granted')).toBeDefined();
    expect(b.isWaiting).toBe(false);
    expect(rowsOf(b, 'SELECT * FROM t WHERE id = 1')[0]).toMatchObject({ v: 999 });
  });

  it('lets two sessions lock different rows without waiting', () => {
    const { a, b } = setup();
    run(a, 'BEGIN');
    run(a, 'UPDATE t SET v = 111 WHERE id = 1');
    run(b, 'BEGIN');
    run(b, 'UPDATE t SET v = 222 WHERE id = 2');

    expect(a.isWaiting).toBe(false);
    expect(b.isWaiting).toBe(false);
  });

  it('blocks an insert into a gap another transaction locked', () => {
    const { a, b } = setup();
    run(a, 'BEGIN');
    // REPEATABLE READ locks the gap even though no row matches.
    run(a, 'DELETE FROM t WHERE id = 4');
    run(b, 'BEGIN');
    const events = run(b, 'INSERT INTO t VALUES (4, 400)');

    expect(events.find((event) => event.type === 'lock-wait')).toBeDefined();
    expect(b.isWaiting).toBe(true);
  });

  it('rolls back the open transaction when a session disconnects', () => {
    const { db, a, b } = setup();
    run(b, 'BEGIN');
    run(b, 'UPDATE t SET v = 999 WHERE id = 3');

    db.beginCollecting();
    db.closeSession(b);

    expect(db.lockManager.held()).toEqual([]);
    expect(rowsOf(a, 'SELECT * FROM t WHERE id = 3')[0]).toMatchObject({ v: 300 });
  });
});

describe('deadlock', () => {
  it('detects the cycle and rolls back the transaction that closed it', () => {
    const { a, b } = setup();
    run(a, 'BEGIN');
    run(a, 'UPDATE t SET v = 11 WHERE id = 1');
    run(b, 'BEGIN');
    run(b, 'UPDATE t SET v = 22 WHERE id = 2');

    // A waits for B's row...
    run(a, 'UPDATE t SET v = 33 WHERE id = 2');
    expect(a.isWaiting).toBe(true);

    // ...and B now asks for A's row, which would close the cycle.
    const events = run(b, 'UPDATE t SET v = 44 WHERE id = 1');

    expect(events.find((event) => event.type === 'deadlock')).toBeDefined();
    expect(b.transaction).toBeNull();
  });
});

describe('MVCC across sessions', () => {
  it('hides another transaction\'s committed update from an open REPEATABLE READ snapshot', () => {
    const { a, b } = setup();
    run(a, 'BEGIN');
    expect(rowsOf(a, 'SELECT * FROM t WHERE id = 1')[0]).toMatchObject({ v: 100 });

    run(b, 'BEGIN');
    run(b, 'UPDATE t SET v = 777 WHERE id = 1');
    run(b, 'COMMIT');

    // A's read view was taken before B committed, so A still sees the old version.
    expect(rowsOf(a, 'SELECT * FROM t WHERE id = 1')[0]).toMatchObject({ v: 100 });

    run(a, 'COMMIT');
    expect(rowsOf(a, 'SELECT * FROM t WHERE id = 1')[0]).toMatchObject({ v: 777 });
  });

  it('shows the newly committed value to READ COMMITTED on the next statement', () => {
    const { a, b } = setup();
    run(a, 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    run(a, 'BEGIN');
    expect(rowsOf(a, 'SELECT * FROM t WHERE id = 1')[0]).toMatchObject({ v: 100 });

    run(b, 'BEGIN');
    run(b, 'UPDATE t SET v = 777 WHERE id = 1');
    run(b, 'COMMIT');

    expect(rowsOf(a, 'SELECT * FROM t WHERE id = 1')[0]).toMatchObject({ v: 777 });
  });

  it('lets READ UNCOMMITTED see an uncommitted change (dirty read)', () => {
    const { a, b } = setup();
    run(a, 'SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED');
    run(b, 'BEGIN');
    run(b, 'UPDATE t SET v = 555 WHERE id = 1');

    run(a, 'BEGIN');
    expect(rowsOf(a, 'SELECT * FROM t WHERE id = 1')[0]).toMatchObject({ v: 555 });
  });

  it('keeps a consistent read from blocking on a write lock', () => {
    const { a, b } = setup();
    run(b, 'BEGIN');
    run(b, 'UPDATE t SET v = 555 WHERE id = 1');

    run(a, 'BEGIN');
    const rows = rowsOf(a, 'SELECT * FROM t WHERE id = 1');

    expect(a.isWaiting).toBe(false);
    expect(rows[0]).toMatchObject({ v: 100 });
  });
});

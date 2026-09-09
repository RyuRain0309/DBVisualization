import { describe, expect, it } from 'vitest';
import { UndoLog } from '../../../src/engine/logs/undoLog';
import { createReadView, isVisible } from '../../../src/engine/mvcc/readView';
import { visibleVersionOf } from '../../../src/engine/mvcc/versionChain';
import type { ClusteredRecord } from '../../../src/engine/schema/record';
import { Database } from '../../../src/engine/transaction/database';
import type { Session } from '../../../src/engine/transaction/session';

function openDatabase(pageCapacity = 4): Session {
  return new Database(pageCapacity).openSession();
}

function run(session: Session, sql: string) {
  const result = session.run(sql);
  if (result.error) throw new Error(result.error);
  return result.steps.map((step) => step.event);
}

describe('read view visibility rule', () => {
  const view = createReadView(5, [3, 7], 9, 0);

  it('always shows the viewing transaction its own changes', () => {
    expect(isVisible(5, view)).toBe(true);
  });

  it('shows transactions that finished before the view was taken', () => {
    expect(isVisible(2, view)).toBe(true);
  });

  it('hides transactions that were still running when the view was taken', () => {
    expect(isVisible(3, view)).toBe(false);
    expect(isVisible(7, view)).toBe(false);
  });

  it('hides transactions that started after the view was taken', () => {
    expect(isVisible(9, view)).toBe(false);
    expect(isVisible(12, view)).toBe(false);
  });

  it('shows a transaction that was neither active nor later', () => {
    expect(isVisible(4, view)).toBe(true);
  });
});

describe('version chain walk', () => {
  /**
   * Row written by tx 2, then updated by tx 8. A view taken while tx 8 was still running has
   * to walk back one undo record to see tx 2's image.
   */
  function fixture() {
    const undoLog = new UndoLog();
    const undo = undoLog.append({
      txId: 8,
      tableName: 't',
      kind: 'UPDATE_UNDO',
      primaryKey: [1],
      beforeImage: { id: 1, v: 'old' },
      beforeTrxId: 2,
      rollPtr: null,
    });
    const record: ClusteredRecord = {
      row: { id: 1, v: 'new' },
      trxId: 8,
      rollPtr: undo.undoNo,
      deleteMark: false,
    };
    return { undoLog, record };
  }

  it('reads the current version when it is visible', () => {
    const { undoLog, record } = fixture();
    const view = createReadView(9, [], 10, 0);

    expect(visibleVersionOf(record, view, undoLog)).toMatchObject({
      row: { v: 'new' },
      hops: 0,
    });
  });

  it('falls back to the previous image when the writer was still active', () => {
    const { undoLog, record } = fixture();
    const view = createReadView(9, [8], 10, 0);

    expect(visibleVersionOf(record, view, undoLog)).toMatchObject({
      row: { v: 'old' },
      hops: 1,
      trxId: 2,
    });
  });

  it('sees nothing when the row only exists because of an invisible INSERT', () => {
    const undoLog = new UndoLog();
    const undo = undoLog.append({
      txId: 8,
      tableName: 't',
      kind: 'INSERT_UNDO',
      primaryKey: [1],
      beforeImage: null,
      beforeTrxId: null,
      rollPtr: null,
    });
    const record: ClusteredRecord = {
      row: { id: 1 },
      trxId: 8,
      rollPtr: undo.undoNo,
      deleteMark: false,
    };

    expect(visibleVersionOf(record, createReadView(9, [8], 10, 0), undoLog).row).toBeNull();
  });

  it('reads the latest version with no read view at all (READ UNCOMMITTED)', () => {
    const { undoLog, record } = fixture();
    expect(visibleVersionOf(record, null, undoLog)).toMatchObject({ row: { v: 'new' }, hops: 0 });
  });
});

describe('read view lifetime per isolation level', () => {
  function sessionWithRow(isolation: string): Session {
    const session = openDatabase(4);
    run(session, `SET TRANSACTION ISOLATION LEVEL ${isolation}`);
    run(session, 'CREATE TABLE t (id INT NOT NULL, v INT, PRIMARY KEY (id))');
    run(session, 'INSERT INTO t VALUES (1, 100)');
    return session;
  }

  it('reuses one read view for the whole transaction under REPEATABLE READ', () => {
    const session = sessionWithRow('REPEATABLE READ');
    run(session, 'BEGIN');
    run(session, 'SELECT * FROM t');
    const first = session.transaction!.readView;

    const events = run(session, 'SELECT * FROM t');
    expect(session.transaction!.readView).toBe(first);
    expect(events.find((e) => e.type === 'read-view-create')).toBeUndefined();
    expect(events.some((e) => e.explanation.includes('재사용'))).toBe(true);
  });

  it('creates a fresh read view for every statement under READ COMMITTED', () => {
    const session = sessionWithRow('READ COMMITTED');
    run(session, 'BEGIN');
    run(session, 'SELECT * FROM t');
    const first = session.transaction!.readView;

    const events = run(session, 'SELECT * FROM t');
    expect(session.transaction!.readView).not.toBe(first);
    expect(events.find((e) => e.type === 'read-view-create')).toBeDefined();
  });

  it('creates no read view under READ UNCOMMITTED', () => {
    const session = sessionWithRow('READ UNCOMMITTED');
    run(session, 'BEGIN');
    const events = run(session, 'SELECT * FROM t');

    expect(session.transaction!.readView).toBeNull();
    expect(events.some((e) => e.explanation.includes('dirty read'))).toBe(true);
  });

  it('takes locks instead of a read view under SERIALIZABLE', () => {
    const session = sessionWithRow('SERIALIZABLE');
    run(session, 'BEGIN');
    run(session, 'SELECT * FROM t');

    expect(session.transaction!.readView).toBeNull();
    expect(session.lockManager.held().length).toBeGreaterThan(0);
  });
});

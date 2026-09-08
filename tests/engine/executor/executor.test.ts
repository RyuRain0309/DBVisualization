import { describe, expect, it } from 'vitest';
import type { StepEvent } from '../../../src/engine/executor/events';
import { Session } from '../../../src/engine/transaction/session';

function run(session: Session, sql: string): StepEvent[] {
  const result = session.run(sql);
  if (result.error) throw new Error(result.error);
  return result.steps.map((step) => step.event);
}

function sessionWithTable(pageCapacity = 4): Session {
  const session = new Session(pageCapacity);
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
  return session;
}

function rowsOf(session: Session, sql: string) {
  const events = run(session, sql);
  const returned = events.find((e) => e.type === 'rows-returned');
  return returned && returned.type === 'rows-returned' ? returned.rows : [];
}

describe('CREATE TABLE', () => {
  it('builds a clustered index plus one B+tree per secondary index', () => {
    const session = sessionWithTable();
    const snapshot = session.snapshot();

    expect(snapshot.tables).toHaveLength(1);
    expect(snapshot.tables[0]!.indexes.map((i) => i.indexId)).toEqual(['PRIMARY', 'idx_email']);
    expect(snapshot.tables[0]!.indexes[0]!.kind).toBe('clustered');
  });

  it('falls back to a hidden row id when no primary key is declared', () => {
    const session = new Session();
    const events = run(session, 'CREATE TABLE t (v INT)');
    const created = events.find((e) => e.type === 'table-created')!;

    expect(created.explanation).toContain('DB_ROW_ID');
    expect(session.snapshot().tables[0]!.table.primaryKey.kind).toBe('hidden-row-id');
  });
});

describe('INSERT', () => {
  it('writes the undo record before touching the page, then logs redo for each mutation', () => {
    const session = sessionWithTable();
    const events = run(session, "INSERT INTO users VALUES (1, 'a', 'a@x.com')");

    const types = events.map((e) => e.type);
    expect(types.indexOf('undo-append')).toBeLessThan(types.indexOf('btree-mutation'));
    expect(types).toContain('redo-append');
    expect(types.filter((t) => t === 'redo-append').length).toBe(
      types.filter((t) => t === 'btree-mutation').length,
    );
  });

  it('updates the secondary index in the same statement', () => {
    const session = sessionWithTable();
    const events = run(session, "INSERT INTO users VALUES (1, 'a', 'a@x.com')");
    const indexes = events
      .filter((e) => e.type === 'btree-mutation')
      .map((e) => (e.type === 'btree-mutation' ? e.indexId : ''));

    expect(new Set(indexes)).toEqual(new Set(['PRIMARY', 'idx_email']));
  });

  it('runs inside an implicit transaction that commits immediately', () => {
    const session = sessionWithTable();
    const events = run(session, "INSERT INTO users VALUES (1, 'a', 'a@x.com')");

    expect(events.find((e) => e.type === 'transaction-begin')).toMatchObject({ implicit: true });
    expect(events.find((e) => e.type === 'transaction-commit')).toMatchObject({ implicit: true });
    expect(events.find((e) => e.type === 'redo-flush')).toBeDefined();
    expect(session.transaction).toBeNull();
  });

  it('splits a leaf page once the page capacity is exceeded', () => {
    const session = sessionWithTable(4);
    run(session, "INSERT INTO users VALUES (1,'a','a@x'), (2,'b','b@x'), (3,'c','c@x'), (4,'d','d@x')");
    const events = run(session, "INSERT INTO users VALUES (5, 'e', 'e@x')");

    const split = events.find(
      (e) => e.type === 'btree-mutation' && e.mutation.type === 'page-split' && e.indexId === 'PRIMARY',
    );
    expect(split).toBeDefined();
    expect(split!.explanation).toContain('분할');
  });

  it('rejects a duplicate primary key', () => {
    const session = sessionWithTable();
    run(session, "INSERT INTO users VALUES (1, 'a', 'a@x')");
    expect(session.run("INSERT INTO users VALUES (1, 'z', 'z@x')").error).toContain('Duplicate entry');
  });
});

describe('UPDATE', () => {
  it('keeps the clustered index in place but rewrites the affected secondary entry', () => {
    const session = sessionWithTable();
    run(session, "INSERT INTO users VALUES (1, 'a', 'a@x')");
    const events = run(session, "UPDATE users SET email = 'b@x' WHERE id = 1");

    const mutations = events.filter((e) => e.type === 'btree-mutation');
    const clustered = mutations.filter((e) => e.type === 'btree-mutation' && e.indexId === 'PRIMARY');
    const secondary = mutations.filter((e) => e.type === 'btree-mutation' && e.indexId === 'idx_email');

    expect(clustered.every((e) => e.type === 'btree-mutation' && e.mutation.type === 'update-entry')).toBe(true);
    expect(
      secondary.map((e) => (e.type === 'btree-mutation' ? e.mutation.type : '')),
    ).toEqual(expect.arrayContaining(['remove-entry', 'insert-entry']));
  });

  it('leaves untouched secondary indexes alone', () => {
    const session = sessionWithTable();
    run(session, "INSERT INTO users VALUES (1, 'a', 'a@x')");
    const events = run(session, "UPDATE users SET name = 'a2' WHERE id = 1");

    const touched = events
      .filter((e) => e.type === 'btree-mutation')
      .map((e) => (e.type === 'btree-mutation' ? e.indexId : ''));
    expect(new Set(touched)).toEqual(new Set(['PRIMARY']));
  });

  it('moves the row when the primary key itself changes', () => {
    const session = sessionWithTable();
    run(session, "INSERT INTO users VALUES (1, 'a', 'a@x')");
    const events = run(session, 'UPDATE users SET id = 9 WHERE id = 1');

    const clustered = events
      .filter((e) => e.type === 'btree-mutation' && e.indexId === 'PRIMARY')
      .map((e) => (e.type === 'btree-mutation' ? e.mutation.type : ''));
    expect(clustered).toEqual(expect.arrayContaining(['remove-entry', 'insert-entry']));
    expect(rowsOf(session, 'SELECT * FROM users')).toEqual([
      { id: 9, name: 'a', email: 'a@x' },
    ]);
  });
});

describe('DELETE and purge', () => {
  it('delete-marks the record first and purges it after the commit', () => {
    const session = sessionWithTable();
    run(session, "INSERT INTO users VALUES (1, 'a', 'a@x'), (2, 'b', 'b@x')");
    const events = run(session, 'DELETE FROM users WHERE id = 1');

    const noteIndex = events.findIndex((e) => e.type === 'note' && e.explanation.includes('delete-mark'));
    const purgeIndex = events.findIndex((e) => e.type === 'purge');
    expect(noteIndex).toBeGreaterThanOrEqual(0);
    expect(purgeIndex).toBeGreaterThan(noteIndex);
    expect(rowsOf(session, 'SELECT * FROM users')).toEqual([{ id: 2, name: 'b', email: 'b@x' }]);
  });
});

describe('transactions', () => {
  it('holds an explicit transaction open until COMMIT', () => {
    const session = sessionWithTable();
    run(session, 'BEGIN');
    expect(session.transaction?.isActive).toBe(true);

    run(session, "INSERT INTO users VALUES (1, 'a', 'a@x')");
    expect(session.transaction?.isActive).toBe(true);

    run(session, 'COMMIT');
    expect(session.transaction).toBeNull();
  });

  it('restores the previous row image on ROLLBACK', () => {
    const session = sessionWithTable();
    run(session, "INSERT INTO users VALUES (1, 'a', 'a@x')");

    run(session, 'BEGIN');
    run(session, "UPDATE users SET name = 'changed' WHERE id = 1");
    expect(rowsOf(session, 'SELECT * FROM users')[0]).toMatchObject({ name: 'changed' });

    const events = run(session, 'ROLLBACK');
    expect(events.find((e) => e.type === 'undo-apply')).toBeDefined();
    expect(rowsOf(session, 'SELECT * FROM users')[0]).toMatchObject({ name: 'a' });
  });

  it('removes rows inserted by a rolled back transaction', () => {
    const session = sessionWithTable();
    run(session, 'BEGIN');
    run(session, "INSERT INTO users VALUES (1, 'a', 'a@x'), (2, 'b', 'b@x')");
    run(session, 'ROLLBACK');

    expect(rowsOf(session, 'SELECT * FROM users')).toEqual([]);
    expect(session.snapshot().tables[0]!.indexes[1]!.tree.pages.flatMap((p) => p.entries)).toEqual([]);
  });

  it('brings a deleted row back on ROLLBACK', () => {
    const session = sessionWithTable();
    run(session, "INSERT INTO users VALUES (1, 'a', 'a@x')");
    run(session, 'BEGIN');
    run(session, 'DELETE FROM users WHERE id = 1');
    expect(rowsOf(session, 'SELECT * FROM users')).toEqual([]);

    run(session, 'ROLLBACK');
    expect(rowsOf(session, 'SELECT * FROM users')).toEqual([{ id: 1, name: 'a', email: 'a@x' }]);
  });

  it('refuses to change the isolation level while a transaction is open', () => {
    const session = sessionWithTable();
    run(session, 'BEGIN');
    expect(session.run('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE').error).toContain(
      'Cannot change isolation level',
    );
  });
});

describe('access paths', () => {
  it('reports a point lookup for a primary key equality', () => {
    const session = sessionWithTable();
    run(session, "INSERT INTO users VALUES (1, 'a', 'a@x')");
    const events = run(session, 'SELECT * FROM users WHERE id = 1');
    const traverse = events.find((e) => e.type === 'index-traverse')!;

    expect(traverse.type === 'index-traverse' && traverse.access).toContain('단일 조회');
  });

  it('reports a full scan when no index can be used', () => {
    const session = sessionWithTable();
    run(session, "INSERT INTO users VALUES (1, 'a', 'a@x')");
    const events = run(session, "SELECT * FROM users WHERE name = 'a'");
    const traverse = events.find((e) => e.type === 'index-traverse')!;

    expect(traverse.type === 'index-traverse' && traverse.access).toContain('전체 스캔');
  });

  it('reports a secondary index scan followed by a clustered lookup', () => {
    const session = sessionWithTable();
    run(session, "INSERT INTO users VALUES (1, 'a', 'a@x')");
    const events = run(session, "SELECT * FROM users WHERE email = 'a@x'");
    const traverse = events.find((e) => e.type === 'index-traverse')!;

    expect(traverse.type === 'index-traverse' && traverse.access).toContain('idx_email');
    expect(traverse.explanation).toContain('클러스터드 인덱스 재조회');
  });
});

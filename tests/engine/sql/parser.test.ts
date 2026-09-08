import { describe, expect, it } from 'vitest';
import { UnsupportedSqlError, parse } from '../../../src/engine/sql/parser';
import { SqlSyntaxError } from '../../../src/engine/sql/tokenizer';

describe('parse CREATE TABLE', () => {
  it('reads columns, primary key and secondary indexes', () => {
    const [parsed] = parse(
      `CREATE TABLE users (
         id INT NOT NULL,
         name VARCHAR(20),
         email VARCHAR(30),
         PRIMARY KEY (id),
         KEY idx_email (email)
       );`,
    );

    expect(parsed!.statement).toEqual({
      kind: 'create-table',
      table: 'users',
      columns: [
        { name: 'id', type: { kind: 'INT' }, notNull: true },
        { name: 'name', type: { kind: 'VARCHAR', length: 20 }, notNull: false },
        { name: 'email', type: { kind: 'VARCHAR', length: 30 }, notNull: false },
      ],
      primaryKey: ['id'],
      indexes: [{ name: 'idx_email', columns: ['email'], unique: false }],
    });
  });

  it('accepts an inline PRIMARY KEY on a column', () => {
    const [parsed] = parse('CREATE TABLE t (id INT PRIMARY KEY, v INT)');
    expect(parsed!.statement).toMatchObject({ kind: 'create-table', primaryKey: ['id'] });
  });

  it('leaves primaryKey null when none is declared so the engine can add a hidden row id', () => {
    const [parsed] = parse('CREATE TABLE t (v INT)');
    expect(parsed!.statement).toMatchObject({ kind: 'create-table', primaryKey: null });
  });
});

describe('parse DML', () => {
  it('parses INSERT with an explicit column list and multiple rows', () => {
    const [parsed] = parse("INSERT INTO users (id, name) VALUES (1, 'a'), (2, 'b')");
    expect(parsed!.statement).toEqual({
      kind: 'insert',
      table: 'users',
      columns: ['id', 'name'],
      rows: [
        [1, 'a'],
        [2, 'b'],
      ],
    });
  });

  it('parses UPDATE with assignments and an AND-ed WHERE', () => {
    const [parsed] = parse("UPDATE users SET name = 'a2', email = NULL WHERE id >= 3 AND id < 10");
    expect(parsed!.statement).toEqual({
      kind: 'update',
      table: 'users',
      assignments: [
        { column: 'name', value: 'a2' },
        { column: 'email', value: null },
      ],
      where: {
        conditions: [
          { column: 'id', operator: '>=', value: 3 },
          { column: 'id', operator: '<', value: 10 },
        ],
      },
    });
  });

  it('parses DELETE and normalises != to <>', () => {
    const [parsed] = parse('DELETE FROM users WHERE id != 3');
    expect(parsed!.statement).toMatchObject({
      kind: 'delete',
      where: { conditions: [{ column: 'id', operator: '<>', value: 3 }] },
    });
  });

  it('parses locking reads', () => {
    expect(parse('SELECT * FROM t WHERE id = 1 FOR UPDATE')[0]!.statement).toMatchObject({
      kind: 'select',
      lockMode: 'exclusive',
    });
    expect(parse('SELECT * FROM t LOCK IN SHARE MODE')[0]!.statement).toMatchObject({
      kind: 'select',
      lockMode: 'share',
    });
    expect(parse('SELECT id, name FROM t')[0]!.statement).toMatchObject({
      kind: 'select',
      columns: ['id', 'name'],
      lockMode: 'none',
    });
  });
});

describe('parse transaction control', () => {
  it('parses BEGIN, START TRANSACTION, COMMIT and ROLLBACK', () => {
    const kinds = parse('BEGIN; START TRANSACTION; COMMIT; ROLLBACK;').map((p) => p.statement.kind);
    expect(kinds).toEqual(['begin', 'begin', 'commit', 'rollback']);
  });

  it('parses every isolation level, with or without a scope keyword', () => {
    const levels = parse(
      `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
       SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
       SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
       SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;`,
    ).map((p) => (p.statement.kind === 'set-isolation' ? p.statement.level : null));

    expect(levels).toEqual([
      'READ UNCOMMITTED',
      'READ COMMITTED',
      'REPEATABLE READ',
      'SERIALIZABLE',
    ]);
  });
});

describe('script handling', () => {
  it('splits a script and keeps the original text of each statement', () => {
    const parsed = parse("BEGIN;\nINSERT INTO t VALUES (1);\n");
    expect(parsed.map((p) => p.text)).toEqual(['BEGIN', 'INSERT INTO t VALUES (1)']);
  });

  it('ignores comments', () => {
    const parsed = parse('-- a comment\nBEGIN; /* another */ COMMIT;');
    expect(parsed).toHaveLength(2);
  });
});

describe('unsupported syntax', () => {
  it('rejects OR, IN, LIKE, JOIN and ORDER BY with an explanatory error', () => {
    for (const sql of [
      'SELECT * FROM t WHERE a = 1 OR b = 2',
      'SELECT * FROM t WHERE a IN (1, 2)',
      "SELECT * FROM t WHERE a LIKE 'x%'",
      'SELECT * FROM t JOIN u',
      'SELECT * FROM t ORDER BY a',
    ]) {
      expect(() => parse(sql), sql).toThrow(UnsupportedSqlError);
    }
  });

  it('reports the position of a syntax error', () => {
    try {
      parse('INSERT INTO t VALUE (1)');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SqlSyntaxError);
      expect((error as SqlSyntaxError).position).toBe(14);
    }
  });
});

import type { SqlValue } from '../schema/record';
import type { ColumnDef, IndexDef } from '../schema/table';
import type { IsolationLevel } from '../transaction/isolationLevel';

export type ComparisonOperator = '=' | '<' | '<=' | '>' | '>=' | '<>';

export interface Condition {
  column: string;
  operator: ComparisonOperator;
  value: SqlValue;
}

/** WHERE is limited to AND-connected single-column comparisons in this simplified subset. */
export interface WhereClause {
  conditions: Condition[];
}

export interface CreateTableStatement {
  kind: 'create-table';
  table: string;
  columns: ColumnDef[];
  primaryKey: string[] | null;
  indexes: IndexDef[];
}

export interface InsertStatement {
  kind: 'insert';
  table: string;
  columns: string[] | null;
  rows: SqlValue[][];
}

export interface Assignment {
  column: string;
  value: SqlValue;
}

export interface UpdateStatement {
  kind: 'update';
  table: string;
  assignments: Assignment[];
  where: WhereClause | null;
}

export interface DeleteStatement {
  kind: 'delete';
  table: string;
  where: WhereClause | null;
}

/** A plain SELECT is a consistent (non-locking) read; FOR UPDATE / LOCK IN SHARE MODE make it a locking read. */
export type SelectLockMode = 'none' | 'share' | 'exclusive';

export interface SelectStatement {
  kind: 'select';
  table: string;
  columns: '*' | string[];
  where: WhereClause | null;
  lockMode: SelectLockMode;
}

export interface BeginStatement {
  kind: 'begin';
}

export interface CommitStatement {
  kind: 'commit';
}

export interface RollbackStatement {
  kind: 'rollback';
}

export interface SetIsolationStatement {
  kind: 'set-isolation';
  level: IsolationLevel;
}

export type Statement =
  | CreateTableStatement
  | InsertStatement
  | UpdateStatement
  | DeleteStatement
  | SelectStatement
  | BeginStatement
  | CommitStatement
  | RollbackStatement
  | SetIsolationStatement;

export function statementText(statement: Statement): string {
  switch (statement.kind) {
    case 'create-table':
      return `CREATE TABLE ${statement.table}`;
    case 'insert':
      return `INSERT INTO ${statement.table}`;
    case 'update':
      return `UPDATE ${statement.table}`;
    case 'delete':
      return `DELETE FROM ${statement.table}`;
    case 'select':
      return `SELECT FROM ${statement.table}`;
    case 'begin':
      return 'BEGIN';
    case 'commit':
      return 'COMMIT';
    case 'rollback':
      return 'ROLLBACK';
    case 'set-isolation':
      return `SET TRANSACTION ISOLATION LEVEL ${statement.level}`;
  }
}

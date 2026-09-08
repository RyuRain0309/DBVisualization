import type { KeyValue, Row, SqlValue } from './record';

export type ColumnType = { kind: 'INT' } | { kind: 'VARCHAR'; length: number };

export interface ColumnDef {
  name: string;
  type: ColumnType;
  notNull: boolean;
}

export interface IndexDef {
  name: string;
  columns: string[];
  unique: boolean;
}

/**
 * When no PRIMARY KEY is declared and no suitable UNIQUE NOT NULL column exists,
 * InnoDB adds a hidden 6-byte DB_ROW_ID and clusters on it (GEN_CLUST_INDEX).
 */
export type PrimaryKeyDef =
  | { kind: 'declared'; columns: string[] }
  | { kind: 'hidden-row-id' };

export const HIDDEN_ROW_ID = 'DB_ROW_ID';

export interface TableDef {
  name: string;
  columns: ColumnDef[];
  primaryKey: PrimaryKeyDef;
  secondaryIndexes: IndexDef[];
}

export function primaryKeyColumns(table: TableDef): string[] {
  return table.primaryKey.kind === 'declared' ? table.primaryKey.columns : [HIDDEN_ROW_ID];
}

export function findColumn(table: TableDef, name: string): ColumnDef | undefined {
  return table.columns.find((c) => c.name.toLowerCase() === name.toLowerCase());
}

export function findIndex(table: TableDef, name: string): IndexDef | undefined {
  return table.secondaryIndexes.find((i) => i.name.toLowerCase() === name.toLowerCase());
}

export function extractKey(row: Row, columns: string[]): KeyValue {
  return columns.map((c) => row[c] ?? null);
}

export function primaryKeyOf(table: TableDef, row: Row): KeyValue {
  return extractKey(row, primaryKeyColumns(table));
}

export function describeColumnType(type: ColumnType): string {
  return type.kind === 'INT' ? 'INT' : `VARCHAR(${type.length})`;
}

export function valueMatchesType(value: SqlValue, type: ColumnType): boolean {
  if (value === null) return true;
  return type.kind === 'INT' ? typeof value === 'number' : typeof value === 'string';
}

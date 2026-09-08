export type SqlValue = number | string | null;

export type Row = Record<string, SqlValue>;

/** Index key. Multi-column keys are represented as a tuple, matching InnoDB composite indexes. */
export type KeyValue = readonly SqlValue[];

/**
 * A record as stored in a clustered index leaf page. Besides the user columns,
 * InnoDB stores hidden system columns used for MVCC and rollback.
 */
export interface ClusteredRecord {
  row: Row;
  /** DB_TRX_ID: transaction that last modified this record. */
  trxId: number;
  /** DB_ROLL_PTR: pointer into the undo log holding the previous version. */
  rollPtr: number | null;
  /** InnoDB does not erase rows on DELETE; it sets a delete-mark until purge removes them. */
  deleteMark: boolean;
}

/** A secondary index leaf entry points at the clustered index key, never at a physical row address. */
export interface SecondaryRecord {
  primaryKey: KeyValue;
  deleteMark: boolean;
}

export function compareValues(a: SqlValue, b: SqlValue): number {
  if (a === null && b === null) return 0;
  // InnoDB orders NULL before any non-NULL value in an ascending index.
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  const as = String(a);
  const bs = String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

export function compareKeys(a: KeyValue, b: KeyValue): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const cmp = compareValues(a[i]!, b[i]!);
    if (cmp !== 0) return cmp;
  }
  return a.length - b.length;
}

export function keysEqual(a: KeyValue, b: KeyValue): boolean {
  return compareKeys(a, b) === 0;
}

export function formatKey(key: KeyValue): string {
  return key.map((v) => (v === null ? 'NULL' : String(v))).join(', ');
}

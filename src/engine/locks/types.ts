import type { KeyValue } from '../schema/record';

export type LockMode = 'S' | 'X' | 'IS' | 'IX';

export type LockGranularity =
  | 'TABLE'
  | 'RECORD'
  | 'GAP'
  | 'NEXT_KEY'
  | 'INSERT_INTENTION'
  | 'AUTO_INC';

export interface LockTarget {
  granularity: LockGranularity;
  tableName: string;
  indexId: string | null;
  /** The locked record, for RECORD and NEXT_KEY locks. */
  key: KeyValue | null;
  /**
   * A gap is named by the record that follows it, matching InnoDB's "lock the gap before
   * this record" wording. `null` here means the gap after the last record (supremum).
   */
  gapBeforeKey: KeyValue | null;
  /** True when the gap runs from the last record to the end of the index. */
  supremum: boolean;
}

export interface Lock {
  id: string;
  txId: number;
  mode: LockMode;
  target: LockTarget;
  /** Why this lock was needed, in Korean, shown in the lock panel. */
  reason: string;
}

export interface LockRequest {
  mode: LockMode;
  target: LockTarget;
  reason: string;
}

export function tableLockTarget(tableName: string): LockTarget {
  return {
    granularity: 'TABLE',
    tableName,
    indexId: null,
    key: null,
    gapBeforeKey: null,
    supremum: false,
  };
}

export function recordLockTarget(
  tableName: string,
  indexId: string,
  key: KeyValue,
  granularity: 'RECORD' | 'NEXT_KEY' = 'RECORD',
): LockTarget {
  return {
    granularity,
    tableName,
    indexId,
    key,
    gapBeforeKey: granularity === 'NEXT_KEY' ? key : null,
    supremum: false,
  };
}

export function gapLockTarget(
  tableName: string,
  indexId: string,
  gapBeforeKey: KeyValue | null,
  granularity: 'GAP' | 'INSERT_INTENTION' = 'GAP',
): LockTarget {
  return {
    granularity,
    tableName,
    indexId,
    key: null,
    gapBeforeKey,
    supremum: gapBeforeKey === null,
  };
}

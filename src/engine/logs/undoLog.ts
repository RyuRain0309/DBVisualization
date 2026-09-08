import type { KeyValue, Row } from '../schema/record';

export type UndoRecordKind = 'INSERT_UNDO' | 'UPDATE_UNDO' | 'DELETE_UNDO';

/**
 * `active`      — the transaction is still running, rollback would apply this record.
 * `retained`    — committed, but kept because a read view may still need the old version.
 * `purged`      — no longer reachable, purge has removed it.
 */
export type UndoRecordState = 'active' | 'retained' | 'purged';

export interface UndoLogRecord {
  undoNo: number;
  txId: number;
  tableName: string;
  kind: UndoRecordKind;
  primaryKey: KeyValue;
  /** Row image before the change. INSERT has no previous version, so it stays null. */
  beforeImage: Row | null;
  /** Trx id stored in the record before this change, restored on rollback. */
  beforeTrxId: number | null;
  /** Previous version of the same row, i.e. the version chain MVCC walks. */
  rollPtr: number | null;
  state: UndoRecordState;
}

export class UndoLog {
  private records = new Map<number, UndoLogRecord>();
  private nextUndoNo = 1;

  append(
    record: Omit<UndoLogRecord, 'undoNo' | 'state'>,
  ): UndoLogRecord {
    const stored: UndoLogRecord = { ...record, undoNo: this.nextUndoNo++, state: 'active' };
    this.records.set(stored.undoNo, stored);
    return stored;
  }

  get(undoNo: number): UndoLogRecord | null {
    return this.records.get(undoNo) ?? null;
  }

  /** Newest first, which is the order rollback has to apply them in. */
  recordsOf(txId: number): UndoLogRecord[] {
    return [...this.records.values()]
      .filter((record) => record.txId === txId)
      .sort((a, b) => b.undoNo - a.undoNo);
  }

  all(): UndoLogRecord[] {
    return [...this.records.values()].sort((a, b) => a.undoNo - b.undoNo);
  }

  /** Walks a row's version chain from newest to oldest. */
  versionChain(rollPtr: number | null): UndoLogRecord[] {
    const chain: UndoLogRecord[] = [];
    let current = rollPtr;
    while (current !== null) {
      const record = this.records.get(current);
      if (!record || record.state === 'purged') break;
      chain.push(record);
      current = record.rollPtr;
    }
    return chain;
  }

  setState(undoNo: number, state: UndoRecordState): void {
    const record = this.records.get(undoNo);
    if (record) record.state = state;
  }

  /** Discards a rolled back transaction's records; they can never be needed again. */
  discard(txId: number): void {
    for (const record of this.recordsOf(txId)) {
      this.records.delete(record.undoNo);
    }
  }
}

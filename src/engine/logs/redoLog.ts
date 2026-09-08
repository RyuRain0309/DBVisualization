import type { BTreeMutation, PageId } from '../btree/types';

export type RedoRecordKind =
  | 'INSERT_REC'
  | 'UPDATE_REC'
  | 'DELETE_REC'
  | 'PAGE_SPLIT'
  | 'PAGE_MERGE'
  | 'PAGE_CREATE'
  | 'PAGE_FREE';

export interface RedoLogRecord {
  lsn: number;
  txId: number;
  indexId: string;
  pageId: PageId;
  kind: RedoRecordKind;
  /**
   * Real redo records are physiological (page id + a physical change inside the page) and binary.
   * This engine keeps a readable description instead; the ordering and the flush timing are what matter here.
   */
  note: string;
}

export interface RedoLogState {
  records: RedoLogRecord[];
  flushedUpToLsn: number;
}

const KIND_BY_MUTATION: Record<BTreeMutation['type'], RedoRecordKind> = {
  'insert-entry': 'INSERT_REC',
  'update-entry': 'UPDATE_REC',
  'remove-entry': 'DELETE_REC',
  'page-split': 'PAGE_SPLIT',
  'page-merge': 'PAGE_MERGE',
  redistribute: 'UPDATE_REC',
  'new-root': 'PAGE_CREATE',
  'root-shrink': 'PAGE_FREE',
  'parent-key-update': 'UPDATE_REC',
};

export function redoKindOf(mutation: BTreeMutation): RedoRecordKind {
  return KIND_BY_MUTATION[mutation.type];
}

export function redoPageOf(mutation: BTreeMutation): PageId {
  switch (mutation.type) {
    case 'redistribute':
      return mutation.toPageId;
    case 'root-shrink':
      return mutation.removedPageId;
    default:
      return mutation.pageId;
  }
}

export class RedoLog {
  private records: RedoLogRecord[] = [];
  private nextLsn = 1;
  private flushedUpToLsn = 0;

  append(txId: number, mutation: BTreeMutation, note: string): RedoLogRecord {
    const record: RedoLogRecord = {
      lsn: this.nextLsn++,
      txId,
      indexId: mutation.indexId,
      pageId: redoPageOf(mutation),
      kind: redoKindOf(mutation),
      note,
    };
    this.records.push(record);
    return record;
  }

  /**
   * Write-ahead logging: the buffered records are made durable before the transaction is
   * reported as committed. Real InnoDB also flushes in the background and lets
   * innodb_flush_log_at_trx_commit weaken this; here it always happens exactly at commit.
   */
  flush(): number {
    const last = this.records.at(-1);
    this.flushedUpToLsn = last ? last.lsn : this.flushedUpToLsn;
    return this.flushedUpToLsn;
  }

  state(): RedoLogState {
    return {
      records: this.records.map((record) => ({ ...record })),
      flushedUpToLsn: this.flushedUpToLsn,
    };
  }

  isDurable(record: RedoLogRecord): boolean {
    return record.lsn <= this.flushedUpToLsn;
  }
}

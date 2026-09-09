import type { BTreeMutation, PageId, TreeSnapshot } from '../btree/types';
import type { Lock, LockRequest } from '../locks/types';
import type { BufferFrame, BufferPoolState } from '../memory/bufferPool';
import type { DoublewriteBatch } from '../memory/doublewrite';
import type { RedoLogRecord, RedoLogState } from '../logs/redoLog';
import type { UndoLogRecord } from '../logs/undoLog';
import type { ReadView } from '../mvcc/readView';
import type { KeyValue, Row } from '../schema/record';
import type { TableDef } from '../schema/table';
import type { Statement } from '../sql/ast';
import type { IsolationLevel } from '../transaction/isolationLevel';

export type StepEventType =
  | 'statement-start'
  | 'statement-end'
  | 'table-created'
  | 'transaction-begin'
  | 'transaction-commit'
  | 'transaction-rollback'
  | 'isolation-change'
  | 'index-traverse'
  | 'btree-mutation'
  | 'redo-append'
  | 'redo-flush'
  | 'undo-append'
  | 'undo-apply'
  | 'undo-retain'
  | 'purge'
  | 'lock-acquire'
  | 'lock-release'
  | 'lock-wait'
  | 'lock-granted'
  | 'deadlock'
  | 'read-view-create'
  | 'visibility-check'
  | 'page-load'
  | 'page-flush'
  | 'checkpoint'
  | 'rows-returned'
  | 'note';

interface BaseEvent {
  /** One line of Korean prose describing *why* this step happened, shown in the explanation feed. */
  explanation: string;
}

export type StepEvent =
  | (BaseEvent & { type: 'statement-start'; sql: string; statement: Statement })
  | (BaseEvent & { type: 'statement-end'; sql: string; affectedRows: number })
  | (BaseEvent & { type: 'table-created'; table: TableDef })
  | (BaseEvent & { type: 'transaction-begin'; txId: number; implicit: boolean })
  | (BaseEvent & { type: 'transaction-commit'; txId: number; implicit: boolean })
  | (BaseEvent & { type: 'transaction-rollback'; txId: number })
  | (BaseEvent & { type: 'isolation-change'; level: IsolationLevel })
  | (BaseEvent & {
      type: 'index-traverse';
      indexId: string;
      path: PageId[];
      key: KeyValue | null;
      access: string;
    })
  | (BaseEvent & { type: 'btree-mutation'; indexId: string; mutation: BTreeMutation })
  | (BaseEvent & { type: 'redo-append'; record: RedoLogRecord })
  | (BaseEvent & { type: 'redo-flush'; upToLsn: number })
  | (BaseEvent & { type: 'undo-append'; record: UndoLogRecord })
  | (BaseEvent & { type: 'undo-apply'; record: UndoLogRecord })
  | (BaseEvent & { type: 'undo-retain'; records: UndoLogRecord[] })
  | (BaseEvent & { type: 'purge'; primaryKey: KeyValue; tableName: string })
  | (BaseEvent & { type: 'lock-acquire'; lock: Lock })
  | (BaseEvent & { type: 'lock-release'; txId: number; locks: Lock[]; cause: 'COMMIT' | 'ROLLBACK' })
  | (BaseEvent & { type: 'lock-wait'; blockerTxId: number; request: LockRequest })
  | (BaseEvent & { type: 'lock-granted'; blockerTxId: number; sql: string })
  | (BaseEvent & { type: 'deadlock'; victimTxId: number; cycle: number[] })
  | (BaseEvent & { type: 'read-view-create'; view: ReadView; policy: string })
  | (BaseEvent & {
      type: 'visibility-check';
      primaryKey: KeyValue;
      hops: number;
      visibleTrxId: number | null;
    })
  | (BaseEvent & { type: 'page-load'; frame: BufferFrame; evicted: BufferFrame | null })
  | (BaseEvent & { type: 'page-flush'; frames: BufferFrame[]; batchId: number })
  | (BaseEvent & { type: 'checkpoint'; flushedPages: number; upToLsn: number })
  | (BaseEvent & { type: 'rows-returned'; rows: Row[] })
  | (BaseEvent & { type: 'note'; detail?: string });

export interface IndexSnapshot {
  indexId: string;
  kind: 'clustered' | 'secondary';
  columns: string[];
  /** Values are rendered generically by the UI, so the payload type is intentionally opaque. */
  tree: TreeSnapshot<unknown>;
}

export interface TableSnapshot {
  table: TableDef;
  indexes: IndexSnapshot[];
}

export interface TransactionSnapshot {
  id: number;
  state: 'active' | 'committed' | 'rolled-back';
  implicit: boolean;
  isolationLevel: IsolationLevel;
  undoRecordCount: number;
}

export interface SessionSnapshot {
  id: number;
  name: string;
  isolationLevel: IsolationLevel;
  transaction: TransactionSnapshot | null;
  readView: ReadView | null;
  /** Set while a statement of this session is parked waiting for someone else's lock. */
  waitingForTxId: number | null;
  pendingSql: string | null;
}

export interface EngineSnapshot {
  tables: TableSnapshot[];
  sessions: SessionSnapshot[];
  pageCapacity: number;
  redo: RedoLogState;
  undo: UndoLogRecord[];
  locks: Lock[];
  bufferPool: BufferPoolState;
  doublewrite: DoublewriteBatch[];
  /** LSN up to which dirty pages have been written back to the tablespaces. */
  checkpointLsn: number;
}

/** One StepEvent plus the state of the whole engine right after it happened. */
export interface ExecutionStep {
  event: StepEvent;
  sessionId: number;
  sessionName: string;
  snapshot: EngineSnapshot;
}

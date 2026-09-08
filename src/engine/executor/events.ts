import type { BTreeMutation, PageId, TreeSnapshot } from '../btree/types';
import type { Lock } from '../locks/types';
import type { RedoLogRecord, RedoLogState } from '../logs/redoLog';
import type { UndoLogRecord } from '../logs/undoLog';
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

export interface EngineSnapshot {
  tables: TableSnapshot[];
  transaction: TransactionSnapshot | null;
  isolationLevel: IsolationLevel;
  pageCapacity: number;
  redo: RedoLogState;
  undo: UndoLogRecord[];
  locks: Lock[];
}

/** One StepEvent plus the state of the whole engine right after it happened. */
export interface ExecutionStep {
  event: StepEvent;
  snapshot: EngineSnapshot;
}

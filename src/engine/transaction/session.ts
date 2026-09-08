import { createPageIdAllocator, type PageIdAllocator } from '../btree/btree';
import { CLUSTERED_INDEX_ID } from '../btree/clusteredIndex';
import type { TreeSnapshot } from '../btree/types';
import { executeStatement, type ExecutionContext } from '../executor/executor';
import type { EngineSnapshot, ExecutionStep, IndexSnapshot, StepEvent } from '../executor/events';
import { RedoLog } from '../logs/redoLog';
import { UndoLog } from '../logs/undoLog';
import { Catalog } from '../schema/catalog';
import { primaryKeyColumns, type TableDef } from '../schema/table';
import { parse } from '../sql/parser';
import { TableStorage } from '../storage/tableStorage';
import type { IsolationLevel } from './isolationLevel';
import { Transaction } from './transaction';

export const DEFAULT_PAGE_CAPACITY = 4;

export interface RunResult {
  steps: ExecutionStep[];
  error: string | null;
}

/**
 * One client connection: its catalog, its storage, its logs and its current transaction.
 * Everything a statement does is reported as a list of steps, each carrying a full snapshot
 * so the UI can scrub back and forth without re-running anything.
 */
export class Session implements ExecutionContext {
  readonly catalog = new Catalog();
  readonly redoLog = new RedoLog();
  readonly undoLog = new UndoLog();
  readonly pageCapacity: number;
  isolationLevel: IsolationLevel = 'REPEATABLE READ';
  transaction: Transaction | null = null;

  private readonly storages = new Map<string, TableStorage>();
  private readonly allocator: PageIdAllocator = createPageIdAllocator();
  private nextTxId = 1;
  private collected: ExecutionStep[] = [];

  constructor(pageCapacity: number = DEFAULT_PAGE_CAPACITY) {
    this.pageCapacity = pageCapacity;
  }

  run(sql: string): RunResult {
    this.collected = [];
    try {
      for (const parsed of parse(sql)) {
        executeStatement(this, parsed);
      }
      return { steps: this.collected, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit({ type: 'note', explanation: `실행 실패: ${message}`, detail: message });
      return { steps: this.collected, error: message };
    }
  }

  storageOf(tableName: string): TableStorage {
    const storage = this.storages.get(tableName.toLowerCase());
    if (!storage) {
      // Reuse the catalog's error wording for an unknown table.
      this.catalog.getTable(tableName);
      throw new Error(`Storage for table '${tableName}' is missing`);
    }
    return storage;
  }

  createStorage(table: TableDef): TableStorage {
    const storage = new TableStorage(table, this.pageCapacity, this.allocator);
    this.storages.set(table.name.toLowerCase(), storage);
    return storage;
  }

  beginTransaction(implicit: boolean): Transaction {
    const tx = new Transaction(this.nextTxId++, this.isolationLevel, implicit);
    this.transaction = tx;
    return tx;
  }

  finishTransaction(state: 'committed' | 'rolled-back'): void {
    if (this.transaction) this.transaction.state = state;
    this.transaction = null;
  }

  emit(event: StepEvent): void {
    this.collected.push({ event, snapshot: this.snapshot() });
  }

  snapshot(): EngineSnapshot {
    return {
      tables: [...this.storages.values()].map((storage) => ({
        table: storage.table,
        indexes: this.indexSnapshots(storage),
      })),
      transaction: this.transaction
        ? {
            id: this.transaction.id,
            state: this.transaction.state,
            implicit: this.transaction.implicit,
            isolationLevel: this.transaction.isolationLevel,
            undoRecordCount: this.transaction.undoNos.length,
          }
        : null,
      isolationLevel: this.isolationLevel,
      pageCapacity: this.pageCapacity,
      redo: this.redoLog.state(),
      undo: this.undoLog.all(),
    };
  }

  private indexSnapshots(storage: TableStorage): IndexSnapshot[] {
    const clustered: IndexSnapshot = {
      indexId: CLUSTERED_INDEX_ID,
      kind: 'clustered',
      columns: primaryKeyColumns(storage.table),
      tree: storage.clustered.tree.snapshot() as TreeSnapshot<unknown>,
    };
    const secondaries = storage.secondaries.map<IndexSnapshot>((index) => ({
      indexId: index.name,
      kind: 'secondary',
      columns: index.def.columns,
      tree: index.tree.snapshot() as TreeSnapshot<unknown>,
    }));
    return [clustered, ...secondaries];
  }
}

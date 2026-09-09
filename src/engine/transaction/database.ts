import { createPageIdAllocator, type PageIdAllocator } from '../btree/btree';
import { CLUSTERED_INDEX_ID } from '../btree/clusteredIndex';
import type { TreeSnapshot } from '../btree/types';
import type { EngineSnapshot, ExecutionStep, IndexSnapshot, StepEvent } from '../executor/events';
import { LockManager } from '../locks/lockManager';
import { RedoLog } from '../logs/redoLog';
import { UndoLog } from '../logs/undoLog';
import { Catalog } from '../schema/catalog';
import { primaryKeyColumns, type TableDef } from '../schema/table';
import { TableStorage } from '../storage/tableStorage';
import { Session } from './session';
import type { Transaction } from './transaction';

export const DEFAULT_PAGE_CAPACITY = 4;

interface Waiter {
  session: Session;
  sql: string;
  blockerTxId: number;
}

/**
 * The server side of the simulator: one set of tables, one lock table, one pair of logs,
 * shared by every open session. Sessions are the client connections that run statements
 * against it, which is what makes lock contention between them possible at all.
 */
export class Database {
  readonly catalog = new Catalog();
  readonly redoLog = new RedoLog();
  readonly undoLog = new UndoLog();
  readonly lockManager = new LockManager();
  readonly pageCapacity: number;

  private readonly storages = new Map<string, TableStorage>();
  private readonly allocator: PageIdAllocator = createPageIdAllocator();
  private readonly sessions: Session[] = [];
  private readonly waiters: Waiter[] = [];
  private nextTxId = 1;
  private nextSessionId = 1;
  private collected: ExecutionStep[] = [];

  constructor(pageCapacity: number = DEFAULT_PAGE_CAPACITY) {
    this.pageCapacity = pageCapacity;
  }

  openSession(name?: string): Session {
    const id = this.nextSessionId++;
    const session = new Session(this, id, name ?? `세션 ${id}`);
    this.sessions.push(session);
    return session;
  }

  closeSession(session: Session): void {
    if (session.transaction?.isActive) session.rollbackForShutdown();
    const index = this.sessions.indexOf(session);
    if (index >= 0) this.sessions.splice(index, 1);
    this.dropWaitersOf(session);
  }

  listSessions(): Session[] {
    return [...this.sessions];
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

  takeTransactionId(): number {
    return this.nextTxId++;
  }

  peekNextTransactionId(): number {
    return this.nextTxId;
  }

  activeTransactions(): Transaction[] {
    return this.sessions
      .map((session) => session.transaction)
      .filter((tx): tx is Transaction => tx !== null && tx.isActive);
  }

  sessionOfTransaction(txId: number): Session | null {
    return this.sessions.find((session) => session.transaction?.id === txId) ?? null;
  }

  /** Collects a step into the shared timeline so the UI sees every session in one order. */
  record(session: Session, event: StepEvent): void {
    this.collected.push({
      event,
      sessionId: session.id,
      sessionName: session.name,
      snapshot: this.snapshot(),
    });
  }

  beginCollecting(): void {
    this.collected = [];
  }

  collectedSteps(): ExecutionStep[] {
    return this.collected;
  }

  stepCount(): number {
    return this.collected.length;
  }

  /** Registers a statement that could not get its locks; it re-runs when the blocker finishes. */
  addWaiter(session: Session, sql: string, blockerTxId: number): void {
    this.waiters.push({ session, sql, blockerTxId });
  }

  dropWaitersOf(session: Session): void {
    for (let i = this.waiters.length - 1; i >= 0; i -= 1) {
      if (this.waiters[i]!.session === session) this.waiters.splice(i, 1);
    }
  }

  /**
   * Follows the wait-for graph from `txId`: which transaction is it ultimately waiting for?
   * A cycle here is a deadlock.
   */
  waitsFor(txId: number): number[] {
    const chain: number[] = [];
    let current: number | null = txId;
    while (current !== null) {
      const waiter = this.waiters.find((w) => w.session.transaction?.id === current);
      const next: number | null = waiter ? waiter.blockerTxId : null;
      if (next === null) break;
      if (chain.includes(next)) break;
      chain.push(next);
      current = next;
    }
    return chain;
  }

  /** Re-runs the statements that were waiting on a transaction that just finished. */
  wakeWaitersOf(txId: number): void {
    const woken = this.waiters.filter((waiter) => waiter.blockerTxId === txId);
    if (woken.length === 0) return;
    for (const waiter of woken) {
      const index = this.waiters.indexOf(waiter);
      if (index >= 0) this.waiters.splice(index, 1);
    }
    for (const waiter of woken) {
      waiter.session.resumeAfterWait(waiter.sql, txId);
    }
  }

  snapshot(): EngineSnapshot {
    return {
      tables: [...this.storages.values()].map((storage) => ({
        table: storage.table,
        indexes: this.indexSnapshots(storage),
      })),
      sessions: this.sessions.map((session) => session.snapshot()),
      pageCapacity: this.pageCapacity,
      redo: this.redoLog.state(),
      undo: this.undoLog.all(),
      locks: this.lockManager.held(),
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

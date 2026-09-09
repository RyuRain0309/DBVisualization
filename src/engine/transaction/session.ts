import {
  DeadlockError,
  LockWaitError,
  executeStatement,
  rollbackTransaction,
  runCheckpoint,
  type ExecutionContext,
} from '../executor/executor';
import type { ExecutionStep, SessionSnapshot, StepEvent } from '../executor/events';
import type { LockManager } from '../locks/lockManager';
import type { BufferPool } from '../memory/bufferPool';
import type { DoublewriteBuffer } from '../memory/doublewrite';
import type { RedoLog } from '../logs/redoLog';
import type { UndoLog } from '../logs/undoLog';
import type { Catalog } from '../schema/catalog';
import type { TableDef } from '../schema/table';
import { parse } from '../sql/parser';
import type { TableStorage } from '../storage/tableStorage';
import type { Database } from './database';
import type { IsolationLevel } from './isolationLevel';
import { Transaction } from './transaction';

export interface RunResult {
  steps: ExecutionStep[];
  error: string | null;
}

/**
 * One client connection. It owns only what a connection owns in MySQL: the current
 * transaction, the isolation level and the read view. Tables, logs and the lock table live
 * in the shared Database.
 */
export class Session implements ExecutionContext {
  readonly id: number;
  name: string;
  readonly db: Database;
  isolationLevel: IsolationLevel = 'REPEATABLE READ';
  transaction: Transaction | null = null;
  /** SQL parked because another transaction holds a conflicting lock. */
  pendingSql: string | null = null;
  waitingForTxId: number | null = null;

  constructor(db: Database, id: number, name: string) {
    this.db = db;
    this.id = id;
    this.name = name;
  }

  get catalog(): Catalog {
    return this.db.catalog;
  }

  get redoLog(): RedoLog {
    return this.db.redoLog;
  }

  get undoLog(): UndoLog {
    return this.db.undoLog;
  }

  get lockManager(): LockManager {
    return this.db.lockManager;
  }

  get bufferPool(): BufferPool {
    return this.db.bufferPool;
  }

  get doublewrite(): DoublewriteBuffer {
    return this.db.doublewrite;
  }

  get isWaiting(): boolean {
    return this.pendingSql !== null;
  }

  run(sql: string): RunResult {
    this.db.beginCollecting();
    this.execute(sql);
    return {
      steps: this.db.collectedSteps(),
      error: this.lastError,
    };
  }

  /** Flushes every dirty page, the way a background checkpoint would. */
  checkpoint(): RunResult {
    this.db.beginCollecting();
    runCheckpoint(this);
    return { steps: this.db.collectedSteps(), error: null };
  }

  /** Runs a statement that had been waiting for a lock, inside the caller's timeline. */
  resumeAfterWait(sql: string, blockerTxId: number): void {
    this.pendingSql = null;
    this.waitingForTxId = null;
    this.emit({
      type: 'lock-granted',
      blockerTxId,
      sql,
      explanation: `트랜잭션 ${blockerTxId} 이 끝나 락이 풀렸다. ${this.name} 의 대기 중이던 문장을 이어서 실행한다.`,
    });
    this.execute(sql);
  }

  private lastError: string | null = null;

  private execute(sql: string): void {
    this.lastError = null;
    try {
      for (const parsed of parse(sql)) {
        executeStatement(this, parsed);
      }
    } catch (error) {
      if (error instanceof LockWaitError) {
        this.parkStatement(sql, error);
        return;
      }
      if (error instanceof DeadlockError) {
        this.handleDeadlock(error);
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      this.emit({ type: 'note', explanation: `실행 실패: ${message}`, detail: message });

      // A failed statement outside BEGIN takes its implicit transaction down with it.
      // Inside an explicit transaction MySQL only rolls back the statement and leaves the
      // transaction open, so the session keeps holding whatever it had.
      const tx = this.transaction;
      if (tx?.isActive && tx.implicit) rollbackTransaction(this, tx);
    }
  }

  private parkStatement(sql: string, error: LockWaitError): void {
    this.pendingSql = sql;
    this.waitingForTxId = error.blockerTxId;
    this.db.addWaiter(this, sql, error.blockerTxId);
    this.emit({
      type: 'lock-wait',
      blockerTxId: error.blockerTxId,
      request: error.request,
      explanation: `${error.description} 을 트랜잭션 ${error.blockerTxId} 이 이미 잡고 있어 대기한다. 실제 InnoDB 도 여기서 innodb_lock_wait_timeout 까지 기다린다.`,
    });
  }

  private handleDeadlock(error: DeadlockError): void {
    this.lastError = 'Deadlock found when trying to get lock; try restarting transaction';
    this.emit({
      type: 'deadlock',
      victimTxId: error.victimTxId,
      cycle: error.cycle,
      explanation: `데드락 감지 (대기 사이클: ${error.cycle.join(' → ')}). InnoDB 는 한쪽을 희생자로 골라 롤백시킨다. 여기서는 마지막에 락을 요청한 트랜잭션 ${error.victimTxId} 이 롤백된다.`,
    });
    const tx = this.transaction;
    if (tx?.isActive) rollbackTransaction(this, tx);
  }

  /** Used when a console is closed while its transaction is still open. */
  rollbackForShutdown(): void {
    const tx = this.transaction;
    if (!tx?.isActive) return;
    this.emit({
      type: 'note',
      explanation: `${this.name} 이 닫혀 열려 있던 트랜잭션 ${tx.id} 을 롤백한다. 연결이 끊긴 트랜잭션은 커밋되지 않는다.`,
    });
    rollbackTransaction(this, tx);
  }

  storageOf(tableName: string): TableStorage {
    return this.db.storageOf(tableName);
  }

  createStorage(table: TableDef): TableStorage {
    return this.db.createStorage(table);
  }

  beginTransaction(implicit: boolean): Transaction {
    const tx = new Transaction(this.db.takeTransactionId(), this.isolationLevel, implicit);
    this.transaction = tx;
    return tx;
  }

  peekNextTransactionId(): number {
    return this.db.peekNextTransactionId();
  }

  activeTransactionIds(): number[] {
    return this.db.activeTransactions().map((tx) => tx.id);
  }

  statementIndex(): number {
    return this.db.stepCount();
  }

  setCheckpointLsn(lsn: number): void {
    this.db.checkpointLsn = lsn;
  }

  waitsFor(txId: number): number[] {
    return this.db.waitsFor(txId);
  }

  finishTransaction(state: 'committed' | 'rolled-back'): void {
    const finished = this.transaction;
    if (finished) finished.state = state;
    this.transaction = null;
    if (finished) this.db.wakeWaitersOf(finished.id);
  }

  emit(event: StepEvent): void {
    this.db.record(this, event);
  }

  snapshot(): SessionSnapshot {
    return {
      id: this.id,
      name: this.name,
      isolationLevel: this.isolationLevel,
      transaction: this.transaction
        ? {
            id: this.transaction.id,
            state: this.transaction.state,
            implicit: this.transaction.implicit,
            isolationLevel: this.transaction.isolationLevel,
            undoRecordCount: this.transaction.undoNos.length,
          }
        : null,
      readView: this.transaction?.readView ?? null,
      waitingForTxId: this.waitingForTxId,
      pendingSql: this.pendingSql,
    };
  }
}

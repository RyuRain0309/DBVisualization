import type { ReadView } from '../mvcc/readView';
import type { IsolationLevel } from './isolationLevel';

export type TransactionState = 'active' | 'committed' | 'rolled-back';

export class Transaction {
  readonly id: number;
  readonly isolationLevel: IsolationLevel;
  /** True for the single-statement transaction MySQL starts when autocommit is on. */
  readonly implicit: boolean;
  state: TransactionState = 'active';
  readonly undoNos: number[] = [];
  /** Snapshot used by consistent reads. REPEATABLE READ keeps the first one for the whole transaction. */
  readView: ReadView | null = null;

  constructor(id: number, isolationLevel: IsolationLevel, implicit: boolean) {
    this.id = id;
    this.isolationLevel = isolationLevel;
    this.implicit = implicit;
  }

  get isActive(): boolean {
    return this.state === 'active';
  }
}

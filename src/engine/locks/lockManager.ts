import { compareKeys, formatKey } from '../schema/record';
import type { Lock, LockGranularity, LockMode, LockRequest, LockTarget } from './types';

const TABLE_CONFLICTS: Record<LockMode, LockMode[]> = {
  IS: ['X'],
  IX: ['S', 'X'],
  S: ['IX', 'X'],
  X: ['IS', 'IX', 'S', 'X'],
};

function sameTarget(a: LockTarget, b: LockTarget): boolean {
  if (a.tableName !== b.tableName || a.indexId !== b.indexId) return false;
  if (a.granularity !== b.granularity) return false;
  if (a.key && b.key) return compareKeys(a.key, b.key) === 0;
  if (a.key || b.key) return false;
  if (a.supremum || b.supremum) return a.supremum === b.supremum;
  if (a.gapBeforeKey && b.gapBeforeKey) return compareKeys(a.gapBeforeKey, b.gapBeforeKey) === 0;
  return !a.gapBeforeKey && !b.gapBeforeKey;
}

function coversRecord(granularity: LockGranularity): boolean {
  return granularity === 'RECORD' || granularity === 'NEXT_KEY';
}

function coversGap(granularity: LockGranularity): boolean {
  return granularity === 'GAP' || granularity === 'NEXT_KEY';
}

/**
 * Whether a request has to wait for an existing lock. Nothing in this engine ever waits today
 * (there is a single session), but the rule lives here as a pure function so a multi-session
 * mode can feed it another transaction's locks without changing the model.
 */
export function wouldConflict(existing: Lock, request: LockRequest): boolean {
  if (existing.target.tableName !== request.target.tableName) return false;

  if (existing.target.granularity === 'TABLE' || request.target.granularity === 'TABLE') {
    if (existing.target.granularity !== request.target.granularity) return false;
    return TABLE_CONFLICTS[existing.mode].includes(request.mode);
  }

  if (existing.target.indexId !== request.target.indexId) return false;

  // A gap lock never blocks another gap lock: gaps only block inserts into them.
  if (request.target.granularity === 'INSERT_INTENTION') {
    return coversGap(existing.target.granularity) && gapsOverlap(existing.target, request.target);
  }
  if (existing.target.granularity === 'INSERT_INTENTION') return false;
  if (coversGap(existing.target.granularity) && coversGap(request.target.granularity)) {
    if (!coversRecord(existing.target.granularity) || !coversRecord(request.target.granularity)) {
      return false;
    }
  }

  if (existing.mode === 'S' && request.mode === 'S') return false;

  if (coversRecord(existing.target.granularity) && coversRecord(request.target.granularity)) {
    return existing.target.key !== null &&
      request.target.key !== null &&
      compareKeys(existing.target.key, request.target.key) === 0;
  }

  return gapsOverlap(existing.target, request.target);
}

function gapsOverlap(a: LockTarget, b: LockTarget): boolean {
  if (a.supremum || b.supremum) return a.supremum === b.supremum;
  const aKey = a.gapBeforeKey;
  const bKey = b.gapBeforeKey;
  if (!aKey || !bKey) return false;
  return compareKeys(aKey, bKey) === 0;
}

export class LockManager {
  private locks: Lock[] = [];
  private nextId = 1;

  /**
   * Grants a lock, or returns the lock it already holds. InnoDB holds row locks until the
   * transaction ends (two-phase locking), so nothing is released in the middle.
   */
  acquire(txId: number, request: LockRequest): { lock: Lock; alreadyHeld: boolean } {
    const held = this.locks.find(
      (lock) => lock.txId === txId && lock.mode === request.mode && sameTarget(lock.target, request.target),
    );
    if (held) return { lock: held, alreadyHeld: true };

    const lock: Lock = {
      id: `lock-${this.nextId++}`,
      txId,
      mode: request.mode,
      target: request.target,
      reason: request.reason,
    };
    this.locks.push(lock);
    return { lock, alreadyHeld: false };
  }

  conflictsFor(txId: number, request: LockRequest): Lock[] {
    return this.locks.filter((lock) => lock.txId !== txId && wouldConflict(lock, request));
  }

  releaseAll(txId: number): Lock[] {
    const released = this.locks.filter((lock) => lock.txId === txId);
    this.locks = this.locks.filter((lock) => lock.txId !== txId);
    return released;
  }

  held(): Lock[] {
    return this.locks.map((lock) => ({ ...lock }));
  }
}

export function describeLockTarget(target: LockTarget): string {
  switch (target.granularity) {
    case 'TABLE':
      return `테이블 ${target.tableName}`;
    case 'RECORD':
      return `${target.indexId} 레코드 (${formatKey(target.key!)})`;
    case 'NEXT_KEY':
      return `${target.indexId} 레코드 (${formatKey(target.key!)}) + 그 앞 갭`;
    case 'GAP':
      return target.supremum
        ? `${target.indexId} 마지막 레코드 뒤 갭 (supremum)`
        : `${target.indexId} 레코드 (${formatKey(target.gapBeforeKey!)}) 앞 갭`;
    case 'INSERT_INTENTION':
      return target.supremum
        ? `${target.indexId} 마지막 레코드 뒤 갭에 삽입 의도`
        : `${target.indexId} 레코드 (${formatKey(target.gapBeforeKey!)}) 앞 갭에 삽입 의도`;
    case 'AUTO_INC':
      return `테이블 ${target.tableName} AUTO_INCREMENT`;
  }
}

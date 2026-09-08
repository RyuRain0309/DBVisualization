import type { Lock } from '../../engine/locks/types';
import { formatKey } from '../../engine/schema/record';

export interface LockMarks {
  /** Locks that cover a record, keyed by the formatted record key. */
  record: Map<string, Lock[]>;
  /** Locks that cover the gap in front of a record, keyed by that record's key. */
  gap: Map<string, Lock[]>;
  /** Locks on the gap after the last record. */
  supremum: Lock[];
}

function push(map: Map<string, Lock[]>, key: string, lock: Lock): void {
  map.set(key, [...(map.get(key) ?? []), lock]);
}

export function lockMarksFor(indexId: string, locks: Lock[]): LockMarks {
  const marks: LockMarks = { record: new Map(), gap: new Map(), supremum: [] };

  for (const lock of locks) {
    if (lock.target.indexId !== indexId) continue;
    const { granularity, key, gapBeforeKey, supremum } = lock.target;

    if (granularity === 'RECORD' || granularity === 'NEXT_KEY') {
      if (key) push(marks.record, formatKey(key), lock);
    }
    if (granularity === 'GAP' || granularity === 'NEXT_KEY' || granularity === 'INSERT_INTENTION') {
      if (supremum) marks.supremum.push(lock);
      else if (gapBeforeKey) push(marks.gap, formatKey(gapBeforeKey), lock);
    }
  }

  return marks;
}

export function hasMarks(marks: LockMarks): boolean {
  return marks.record.size > 0 || marks.gap.size > 0 || marks.supremum.length > 0;
}

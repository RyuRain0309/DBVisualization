import type { AccessPath } from '../executor/predicate';
import { formatKey, type KeyValue } from '../schema/record';
import type { TableDef } from '../schema/table';
import { behaviorOf, type IsolationLevel } from '../transaction/isolationLevel';
import { gapLockTarget, recordLockTarget, tableLockTarget, type LockMode, type LockRequest } from './types';

export type StatementLockKind = 'insert' | 'update' | 'delete' | 'locking-read' | 'consistent-read';

export interface LockPlanInput {
  table: TableDef;
  kind: StatementLockKind;
  /** S for a share-mode read, X for writes and SELECT ... FOR UPDATE. */
  rowMode: LockMode;
  access: AccessPath;
  isolationLevel: IsolationLevel;
  /** Records the statement actually operates on. */
  matchedKeys: KeyValue[];
  /** Records the scan had to look at, matched or not. */
  scannedKeys: KeyValue[];
  /** Key of the record right after `key`, or null when `key` is past the last record. */
  nextKeyAfter: (key: KeyValue) => KeyValue | null;
  /** True when the scan ran to the end of the index. */
  reachedEnd: boolean;
}

/**
 * Turns a statement plus its access path into the exact set of locks InnoDB would take.
 * The isolation level enters here in one place: whether gaps are locked at all.
 */
export function computeRequiredLocks(input: LockPlanInput): LockRequest[] {
  if (input.kind === 'consistent-read') return [];

  const behavior = behaviorOf(input.isolationLevel);
  const tableName = input.table.name;
  const indexId = input.access.indexId;
  const requests: LockRequest[] = [];

  const tableMode: LockMode = input.rowMode === 'S' ? 'IS' : 'IX';
  requests.push({
    mode: tableMode,
    target: tableLockTarget(tableName),
    reason: `행 단위 락을 잡기 전에 테이블 단위 의도 락(${tableMode})을 먼저 잡는다. 다른 트랜잭션이 테이블 전체를 잠그려 할 때 행 락을 일일이 확인하지 않아도 되게 하는 장치다.`,
  });

  if (input.kind === 'insert') {
    for (const key of input.matchedKeys) {
      const nextKey = input.nextKeyAfter(key);
      requests.push({
        mode: 'X',
        target: gapLockTarget(tableName, indexId, nextKey, 'INSERT_INTENTION'),
        reason:
          '삽입 위치의 갭에 insert intention 락을 잡는다. 같은 갭을 노리는 다른 삽입끼리는 충돌하지 않지만, 그 갭에 갭 락이 걸려 있으면 대기한다.',
      });
      requests.push({
        mode: 'X',
        target: recordLockTarget(tableName, indexId, key),
        reason:
          '새로 넣은 레코드에는 X 락이 걸린 것과 같다. InnoDB 는 자기가 삽입한 행에 별도 락 객체를 만들지 않고, 레코드에 적힌 트랜잭션 ID 로 묵시적 락(implicit lock)을 표현한다.',
      });
    }
    return requests;
  }

  const uniquePointLookup = input.access.kind === 'pk-point';

  if (uniquePointLookup) {
    const key = input.access.key!;
    if (input.matchedKeys.length > 0) {
      requests.push({
        mode: input.rowMode,
        target: recordLockTarget(tableName, indexId, key),
        reason: behavior.gapLocking
          ? `유니크 인덱스를 정확히 하나 찾은 경우라 ${input.isolationLevel} 에서도 넥스트키 락이 레코드 락으로 축소된다. 이미 존재하는 행이라 팬텀이 생길 여지가 없기 때문이다.`
          : '레코드 락만 잡는다. 갭 락을 쓰지 않는 격리수준이다.',
      });
      return requests;
    }

    // No matching row: only a gap-locking isolation level takes anything here.
    if (behavior.gapLocking) {
      requests.push({
        mode: input.rowMode,
        target: gapLockTarget(tableName, indexId, input.nextKeyAfter(key)),
        reason:
          '조건에 맞는 행이 없어도 갭 락을 잡는다. 다른 트랜잭션이 그 자리에 행을 끼워 넣어 팬텀이 생기는 것을 막기 위해서다.',
      });
    }
    return requests;
  }

  if (behavior.gapLocking) {
    for (const key of input.scannedKeys) {
      requests.push({
        mode: input.rowMode,
        target: recordLockTarget(tableName, indexId, key, 'NEXT_KEY'),
        reason: `범위 스캔이 훑은 레코드 (${formatKey(key)}) 와 그 앞 갭을 함께 잠근다(넥스트키 락). 조건에 맞지 않는 행도 스캔했다면 잠긴다.`,
      });
    }
    if (input.reachedEnd) {
      requests.push({
        mode: input.rowMode,
        target: gapLockTarget(tableName, indexId, null),
        reason:
          '스캔이 인덱스 끝까지 갔으므로 마지막 레코드 뒤 supremum 갭도 잠근다. 뒤에 새 행이 붙는 것을 막는다.',
      });
    }
    return requests;
  }

  for (const key of input.matchedKeys) {
    requests.push({
      mode: input.rowMode,
      target: recordLockTarget(tableName, indexId, key),
      reason:
        '갭 락이 없는 격리수준이라 조건에 실제로 맞은 행에만 레코드 락을 건다. 스캔했지만 맞지 않은 행의 락은 곧바로 풀린다.',
    });
  }
  return requests;
}

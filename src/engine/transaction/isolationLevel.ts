export type IsolationLevel =
  | 'READ UNCOMMITTED'
  | 'READ COMMITTED'
  | 'REPEATABLE READ'
  | 'SERIALIZABLE';

export const ISOLATION_LEVELS: IsolationLevel[] = [
  'READ UNCOMMITTED',
  'READ COMMITTED',
  'REPEATABLE READ',
  'SERIALIZABLE',
];

export interface IsolationBehavior {
  /**
   * When enabled, locking reads and writes take next-key locks (record + preceding gap)
   * instead of plain record locks, which is what prevents phantom rows.
   */
  gapLocking: boolean;
  /** How often a consistent-read snapshot is taken. */
  readViewPolicy: 'none' | 'per-statement' | 'per-transaction';
  /** SERIALIZABLE silently turns plain SELECT into SELECT ... LOCK IN SHARE MODE. */
  plainSelectLocks: boolean;
  description: string;
}

export const ISOLATION_BEHAVIOR: Record<IsolationLevel, IsolationBehavior> = {
  'READ UNCOMMITTED': {
    gapLocking: false,
    readViewPolicy: 'none',
    plainSelectLocks: false,
    description:
      '읽기 시 read view를 만들지 않고 최신 버전을 그대로 읽는다. 커밋되지 않은 변경도 보이므로 dirty read가 발생한다.',
  },
  'READ COMMITTED': {
    gapLocking: false,
    readViewPolicy: 'per-statement',
    plainSelectLocks: false,
    description:
      'statement 마다 새 read view를 만든다. 갭 락을 쓰지 않아 팬텀이 가능하지만 락 경합은 적다.',
  },
  'REPEATABLE READ': {
    gapLocking: true,
    readViewPolicy: 'per-transaction',
    plainSelectLocks: false,
    description:
      'InnoDB 기본값. 트랜잭션 첫 읽기에서 만든 read view를 끝까지 재사용하고, 잠금 읽기·쓰기에는 넥스트키 락을 걸어 팬텀을 막는다.',
  },
  SERIALIZABLE: {
    gapLocking: true,
    readViewPolicy: 'per-transaction',
    plainSelectLocks: true,
    description:
      '평범한 SELECT도 LOCK IN SHARE MODE 처럼 S 락을 잡는다. 사실상 모든 읽기가 잠금 읽기가 된다.',
  },
};

export function behaviorOf(level: IsolationLevel): IsolationBehavior {
  return ISOLATION_BEHAVIOR[level];
}

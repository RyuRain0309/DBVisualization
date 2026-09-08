import type { Lock } from '../../engine/locks/types';

function tooltip(locks: Lock[]): string {
  return locks.map((lock) => `${lock.mode}: ${lock.reason}`).join('\n');
}

/** Sits on a record cell: this record itself is locked. */
export function RecordLockBadge({ locks, x, y }: { locks: Lock[]; x: number; y: number }) {
  const mode = locks.some((lock) => lock.mode === 'X') ? 'X' : 'S';

  return (
    <g className="lock-badge-group" transform={`translate(${x}, ${y})`}>
      <title>{tooltip(locks)}</title>
      <circle className={`lock-badge lock-badge--${mode}`} r={7} />
      <text className="lock-badge__text" y={3}>
        {mode}
      </text>
    </g>
  );
}

/** A hatched strip standing in the space between two records — the gap itself is locked. */
export function GapLockBadge({
  locks,
  x,
  y,
  height,
}: {
  locks: Lock[];
  x: number;
  y: number;
  height: number;
}) {
  const intention = locks.every((lock) => lock.target.granularity === 'INSERT_INTENTION');

  return (
    <g className="lock-badge-group" transform={`translate(${x}, ${y})`}>
      <title>{tooltip(locks)}</title>
      <rect
        className={`gap-lock ${intention ? 'gap-lock--intention' : ''}`}
        width={7}
        height={height}
        rx={2}
      />
    </g>
  );
}

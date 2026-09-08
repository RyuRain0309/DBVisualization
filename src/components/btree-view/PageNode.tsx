import { GapLockBadge, RecordLockBadge } from '../lock-panel/LockBadge';
import type { LockMarks } from '../lock-panel/lockMarks';
import { HEADER_HEIGHT, type LaidOutPage } from './layout';

interface Props {
  page: LaidOutPage;
  highlight: 'none' | 'traverse' | 'mutate';
  marks: LockMarks;
}

/**
 * Positions come from the `transform` attribute and are animated with a CSS transition rather
 * than a motion library: SVG groups are not laid out like HTML boxes, and letting the browser
 * interpolate the transform is what actually makes a page split read as one page becoming two.
 */
export function PageNode({ page, highlight, marks }: Props) {
  const { box } = page;
  const cellTop = HEADER_HEIGHT;
  const cellHeight = page.height - HEADER_HEIGHT - 4;

  return (
    <g
      className={`page page--${box.kind} page--highlight-${highlight}`}
      transform={`translate(${page.x}, ${page.y})`}
    >
      <rect className="page__frame" width={page.width} height={page.height} rx={6} />
      <text className="page__label" x={7} y={13}>
        p{box.id} · {box.kind === 'leaf' ? '리프' : `레벨 ${box.level}`}
      </text>

      {box.cells.length === 0 && (
        <text className="page__empty" x={page.width / 2} y={cellTop + cellHeight / 2 + 4}>
          (빈 페이지)
        </text>
      )}

      {page.cells.map((cell, index) => {
        const model = box.cells[index]!;
        const recordLocks = box.kind === 'leaf' ? marks.record.get(model.key) : undefined;
        const gapLocks = box.kind === 'leaf' ? marks.gap.get(model.key) : undefined;

        return (
          <g key={model.key} transform={`translate(${cell.x}, ${cellTop})`}>
            <rect
              className={`page__cell ${model.deleteMark ? 'page__cell--deleted' : ''}`}
              width={cell.width - 2}
              height={cellHeight}
              rx={4}
            />
            <text className="page__key" x={cell.width / 2 - 1} y={14}>
              {model.primary}
            </text>
            {model.secondary && (
              <text className="page__value" x={cell.width / 2 - 1} y={27}>
                {model.secondary}
              </text>
            )}
            {gapLocks && <GapLockBadge locks={gapLocks} x={-4} y={2} height={cellHeight - 4} />}
            {recordLocks && <RecordLockBadge locks={recordLocks} x={cell.width - 10} y={-2} />}
          </g>
        );
      })}

      {box.kind === 'leaf' && box.nextLeafId === null && marks.supremum.length > 0 && (
        <GapLockBadge
          locks={marks.supremum}
          x={page.width - 3}
          y={cellTop + 2}
          height={cellHeight - 4}
        />
      )}
    </g>
  );
}

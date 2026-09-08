import { motion } from 'framer-motion';
import { HEADER_HEIGHT, type LaidOutPage } from './layout';

interface Props {
  page: LaidOutPage;
  highlight: 'none' | 'traverse' | 'mutate';
}

export function PageNode({ page, highlight }: Props) {
  const { box } = page;
  const cellTop = HEADER_HEIGHT;
  const cellHeight = page.height - HEADER_HEIGHT - 4;

  return (
    <motion.g
      // Framer's layout animations assume HTML boxes, so SVG pages animate their own
      // transform instead: a new page fades in where it belongs and moves when the tree reflows.
      initial={{ opacity: 0, x: page.x, y: page.y }}
      animate={{ opacity: 1, x: page.x, y: page.y }}
      exit={{ opacity: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 28 }}
      className={`page page--${box.kind} page--highlight-${highlight}`}
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
          </g>
        );
      })}
    </motion.g>
  );
}

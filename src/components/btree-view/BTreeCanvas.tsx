import { useMemo } from 'react';
import type { IndexSnapshot } from '../../engine/executor/events';
import { layoutTree } from './layout';
import { PageNode } from './PageNode';
import { LeafLink, TreeEdge } from './TreeEdge';
import { indexHint, indexTitle, toPageBoxes } from './treeModel';
import type { Highlight } from './highlight';
import type { Lock } from '../../engine/locks/types';
import { lockMarksFor } from '../lock-panel/lockMarks';

const PADDING = 16;

interface Props {
  index: IndexSnapshot;
  highlight: Highlight;
  locks: Lock[];
}

export function BTreeCanvas({ index, highlight, locks }: Props) {
  const marks = useMemo(() => lockMarksFor(index.indexId, locks), [index.indexId, locks]);
  const layout = useMemo(() => {
    const boxes = toPageBoxes(index.tree);
    return layoutTree(boxes, index.tree.rootId);
  }, [index]);

  const active = highlight.indexId === index.indexId;

  return (
    <section className="tree">
      <header className="tree__header">
        <h3>{indexTitle(index)}</h3>
        <p>{indexHint(index)}</p>
      </header>

      {layout.pages.length === 0 ? (
        <p className="tree__empty">아직 이 인덱스에 레코드가 없다.</p>
      ) : (
        <div className="tree__scroll">
          <svg
            className="tree__svg"
            width={layout.width + PADDING * 2}
            height={layout.height + PADDING * 2}
            viewBox={`${-PADDING} ${-PADDING} ${layout.width + PADDING * 2} ${layout.height + PADDING * 2}`}
          >
            <g>
              {layout.leafLinks.map((link) => (
                <LeafLink key={link.id} link={link} />
              ))}
              {layout.edges.map((edge) => (
                <TreeEdge
                  key={edge.id}
                  edge={edge}
                  active={active && highlight.traversed.has(edge.toPageId)}
                />
              ))}
            </g>
            <g>
              {layout.pages.map((page) => (
                <PageNode
                  key={page.box.id}
                  page={page}
                  marks={marks}
                  highlight={
                    !active
                      ? 'none'
                      : highlight.mutated.has(page.box.id)
                        ? 'mutate'
                        : highlight.traversed.has(page.box.id)
                          ? 'traverse'
                          : 'none'
                  }
                />
              ))}
            </g>
          </svg>
        </div>
      )}
    </section>
  );
}

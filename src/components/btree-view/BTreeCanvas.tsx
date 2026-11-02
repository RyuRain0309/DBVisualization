import { useMemo } from 'react';
import type { IndexSnapshot } from '../../engine/executor/events';
import { layoutTree } from './layout';
import { PageNode } from './PageNode';
import { LeafLink, TreeEdge } from './TreeEdge';
import { indexHint, indexTitle, toPageBoxes, treeStats } from './treeModel';
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
  const stats = useMemo(() => treeStats(index.tree), [index]);

  const active = highlight.indexId === index.indexId;
  const clustered = index.kind === 'clustered';

  return (
    <section className={`tree tree--${index.kind} ${active ? 'tree--active' : ''}`}>
      <header className="tree__header">
        <div className="tree__title">
          <span className={`tree__kind tree__kind--${index.kind}`}>
            {clustered ? '클러스터드' : '세컨더리'}
          </span>
          <h3>{indexTitle(index)}</h3>
        </div>
        <p>{indexHint(index)}</p>

        <dl className="tree__stats">
          <div>
            <dt>페이지</dt>
            <dd>{stats.pages}</dd>
          </div>
          <div>
            <dt>높이</dt>
            <dd>{stats.height}</dd>
          </div>
          <div>
            <dt>리프 엔트리</dt>
            <dd>{stats.leafEntries}</dd>
          </div>
          <div>
            <dt>리프에 담긴 것</dt>
            <dd>{clustered ? '행 전체 + Hidden Column' : '인덱스 키 + PK'}</dd>
          </div>
        </dl>
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

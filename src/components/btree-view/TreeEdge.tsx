import type { LaidOutEdge, LaidOutLeafLink } from './layout';

export function TreeEdge({ edge, active }: { edge: LaidOutEdge; active: boolean }) {
  const midY = (edge.y1 + edge.y2) / 2;
  const path = `M ${edge.x1} ${edge.y1} C ${edge.x1} ${midY}, ${edge.x2} ${midY}, ${edge.x2} ${edge.y2}`;

  return <path className={`edge ${active ? 'edge--active' : ''}`} d={path} />;
}

/** The sideways chain that lets a range scan walk from one leaf to the next. */
export function LeafLink({ link }: { link: LaidOutLeafLink }) {
  return (
    <line className="leaf-link" x1={link.x1} x2={link.x2} y1={link.y} y2={link.y} />
  );
}

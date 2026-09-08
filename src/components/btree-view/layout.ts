import type { PageId } from '../../engine/btree/types';
import type { PageBox } from './treeModel';

export const CHAR_WIDTH = 6.6;
export const HEADER_HEIGHT = 18;
export const CELL_PADDING = 10;
export const LEAF_CELL_HEIGHT = 34;
export const INTERNAL_CELL_HEIGHT = 30;
export const PAGE_GAP = 34;
export const LEVEL_GAP = 72;

export interface LaidOutCell {
  x: number;
  width: number;
}

export interface LaidOutPage {
  box: PageBox;
  x: number;
  y: number;
  width: number;
  height: number;
  cells: LaidOutCell[];
}

export interface LaidOutEdge {
  id: string;
  fromPageId: PageId;
  toPageId: PageId;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LaidOutLeafLink {
  id: string;
  x1: number;
  y: number;
  x2: number;
}

export interface TreeLayout {
  pages: LaidOutPage[];
  edges: LaidOutEdge[];
  leafLinks: LaidOutLeafLink[];
  width: number;
  height: number;
}

function cellWidth(text: string, secondary: string | undefined): number {
  const longest = Math.max(text.length, secondary?.length ?? 0);
  return Math.max(56, Math.round(longest * CHAR_WIDTH) + CELL_PADDING * 2);
}

function pageSize(box: PageBox): { width: number; height: number; cells: number[] } {
  const cells = box.cells.map((cell) => cellWidth(cell.primary, cell.secondary));
  const contentWidth = cells.reduce((sum, w) => sum + w, 0);
  const cellHeight = box.kind === 'leaf' ? LEAF_CELL_HEIGHT : INTERNAL_CELL_HEIGHT;
  return {
    width: Math.max(72, contentWidth + 8),
    height: HEADER_HEIGHT + cellHeight + 8,
    cells,
  };
}

/**
 * Tidy top-down layout. Pages have very different widths (a page with four rows is much wider
 * than one with a single key), so instead of a fixed node size the leaves are packed left to
 * right and every parent is centred over its children, with a pass that pushes overlapping
 * siblings apart.
 */
export function layoutTree(boxes: PageBox[], rootId: PageId | null): TreeLayout {
  if (rootId === null || boxes.length === 0) {
    return { pages: [], edges: [], leafLinks: [], width: 0, height: 0 };
  }

  const byId = new Map(boxes.map((box) => [box.id, box]));
  const sizes = new Map(boxes.map((box) => [box.id, pageSize(box)]));
  const depth = new Map<PageId, number>();
  const ordered: PageId[] = [];

  const walk = (id: PageId, level: number) => {
    const box = byId.get(id);
    if (!box) return;
    depth.set(id, level);
    ordered.push(id);
    for (const childId of box.childIds) walk(childId, level + 1);
  };
  walk(rootId, 0);

  const x = new Map<PageId, number>();
  let cursor = 0;

  const place = (id: PageId): number => {
    const box = byId.get(id)!;
    const size = sizes.get(id)!;
    if (box.childIds.length === 0) {
      const position = cursor;
      cursor += size.width + PAGE_GAP;
      x.set(id, position);
      return position;
    }

    const childCentres = box.childIds.map((childId) => {
      const childX = place(childId);
      return childX + sizes.get(childId)!.width / 2;
    });
    const centre = (childCentres[0]! + childCentres.at(-1)!) / 2;
    const position = centre - size.width / 2;
    x.set(id, position);
    cursor = Math.max(cursor, position + size.width + PAGE_GAP);
    return position;
  };
  place(rootId);

  // Parents can be wider than the span of their children; nudge overlapping siblings apart.
  const levels = new Map<number, PageId[]>();
  for (const id of ordered) {
    const level = depth.get(id)!;
    levels.set(level, [...(levels.get(level) ?? []), id]);
  }
  for (const ids of levels.values()) {
    const sorted = [...ids].sort((a, b) => x.get(a)! - x.get(b)!);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1]!;
      const current = sorted[i]!;
      const minX = x.get(previous)! + sizes.get(previous)!.width + PAGE_GAP;
      if (x.get(current)! < minX) x.set(current, minX);
    }
  }

  const maxLevel = Math.max(...depth.values());
  const rowHeight = new Map<number, number>();
  for (const id of ordered) {
    const level = depth.get(id)!;
    rowHeight.set(level, Math.max(rowHeight.get(level) ?? 0, sizes.get(id)!.height));
  }
  const rowY = new Map<number, number>();
  let y = 0;
  for (let level = 0; level <= maxLevel; level += 1) {
    rowY.set(level, y);
    y += (rowHeight.get(level) ?? 0) + LEVEL_GAP;
  }

  const minX = Math.min(...[...x.values()]);
  const pages: LaidOutPage[] = ordered.map((id) => {
    const box = byId.get(id)!;
    const size = sizes.get(id)!;
    const pageX = x.get(id)! - minX;
    const pageY = rowY.get(depth.get(id)!)!;

    let offset = 4;
    const cells = size.cells.map((width) => {
      const cell = { x: offset, width };
      offset += width;
      return cell;
    });

    return { box, x: pageX, y: pageY, width: size.width, height: size.height, cells };
  });

  const positions = new Map(pages.map((page) => [page.box.id, page]));

  const edges: LaidOutEdge[] = [];
  for (const page of pages) {
    page.box.childIds.forEach((childId, index) => {
      const child = positions.get(childId);
      if (!child) return;
      const cell = page.cells[index];
      edges.push({
        id: `${page.box.id}-${childId}`,
        fromPageId: page.box.id,
        toPageId: childId,
        x1: page.x + (cell ? cell.x + cell.width / 2 : page.width / 2),
        y1: page.y + page.height,
        x2: child.x + child.width / 2,
        y2: child.y,
      });
    });
  }

  const leafLinks: LaidOutLeafLink[] = [];
  for (const page of pages) {
    const nextId = page.box.nextLeafId;
    if (nextId === null) continue;
    const next = positions.get(nextId);
    if (!next) continue;
    leafLinks.push({
      id: `leaf-${page.box.id}-${nextId}`,
      x1: page.x + page.width,
      x2: next.x,
      y: page.y + page.height / 2 + 6,
    });
  }

  const width = Math.max(...pages.map((page) => page.x + page.width));
  const height = Math.max(...pages.map((page) => page.y + page.height));
  return { pages, edges, leafLinks, width, height };
}

import type { PageId } from '../../engine/btree/types';
import type { StepEvent } from '../../engine/executor/events';

export interface Highlight {
  indexId: string | null;
  traversed: Set<PageId>;
  mutated: Set<PageId>;
}

const EMPTY: Highlight = { indexId: null, traversed: new Set(), mutated: new Set() };

/** Which pages the current step touched, so the canvas can point at them. */
export function highlightOf(event: StepEvent | null): Highlight {
  if (!event) return EMPTY;

  if (event.type === 'index-traverse') {
    return { indexId: event.indexId, traversed: new Set(event.path), mutated: new Set() };
  }

  if (event.type === 'btree-mutation') {
    const mutation = event.mutation;
    const pages: PageId[] = [];
    switch (mutation.type) {
      case 'page-split':
        pages.push(mutation.pageId, mutation.newPageId);
        break;
      case 'page-merge':
        pages.push(mutation.pageId);
        break;
      case 'redistribute':
        pages.push(mutation.fromPageId, mutation.toPageId);
        break;
      case 'root-shrink':
        if (mutation.newRootId !== null) pages.push(mutation.newRootId);
        break;
      default:
        pages.push(mutation.pageId);
    }
    return { indexId: event.indexId, traversed: new Set(), mutated: new Set(pages) };
  }

  return EMPTY;
}

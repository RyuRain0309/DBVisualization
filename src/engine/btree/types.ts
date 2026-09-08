import type { KeyValue } from '../schema/record';

export type PageId = number;

export interface LeafEntry<V> {
  key: KeyValue;
  value: V;
}

/**
 * A non-leaf record in InnoDB holds the *smallest* key of the child page plus the child page number.
 * Keeping that convention (instead of classic "separator between children") means the key shown on a
 * node in the UI is literally the key stored in the page.
 */
export interface InternalEntry {
  key: KeyValue;
  childId: PageId;
}

export interface LeafPage<V> {
  kind: 'leaf';
  id: PageId;
  parentId: PageId | null;
  level: 0;
  entries: LeafEntry<V>[];
  /** InnoDB links leaf pages both ways so a range scan can walk sideways without re-descending. */
  prevLeafId: PageId | null;
  nextLeafId: PageId | null;
}

export interface InternalPage {
  kind: 'internal';
  id: PageId;
  parentId: PageId | null;
  level: number;
  entries: InternalEntry[];
}

export type Page<V> = LeafPage<V> | InternalPage;

export type BTreeMutation =
  | { type: 'insert-entry'; indexId: string; pageId: PageId; key: KeyValue; slot: number }
  | { type: 'update-entry'; indexId: string; pageId: PageId; key: KeyValue }
  | { type: 'remove-entry'; indexId: string; pageId: PageId; key: KeyValue }
  | {
      type: 'page-split';
      indexId: string;
      pageId: PageId;
      newPageId: PageId;
      separatorKey: KeyValue;
      level: number;
      movedEntries: number;
    }
  | {
      type: 'page-merge';
      indexId: string;
      pageId: PageId;
      removedPageId: PageId;
      level: number;
      movedEntries: number;
    }
  | {
      type: 'redistribute';
      indexId: string;
      fromPageId: PageId;
      toPageId: PageId;
      key: KeyValue;
      level: number;
    }
  | { type: 'new-root'; indexId: string; pageId: PageId; level: number }
  | { type: 'root-shrink'; indexId: string; removedPageId: PageId; newRootId: PageId | null }
  | {
      type: 'parent-key-update';
      indexId: string;
      pageId: PageId;
      oldKey: KeyValue;
      newKey: KeyValue;
    };

export interface TreeSnapshot<V> {
  indexId: string;
  rootId: PageId | null;
  capacity: number;
  pages: Page<V>[];
}

export class DuplicateKeyError extends Error {}

import { compareKeys, formatKey, type KeyValue } from '../schema/record';
import {
  DuplicateKeyError,
  type BTreeMutation,
  type InternalPage,
  type LeafPage,
  type Page,
  type PageId,
  type TreeSnapshot,
} from './types';

export interface PageIdAllocator {
  next(): PageId;
}

export function createPageIdAllocator(start = 1): PageIdAllocator {
  let id = start;
  return {
    next: () => id++,
  };
}

export interface SearchResult<V> {
  /** Root-to-leaf page ids, i.e. the pages InnoDB would have to latch and read. */
  path: PageId[];
  leafId: PageId;
  slot: number;
  found: boolean;
  value: V | null;
}

export interface MutationResult {
  path: PageId[];
  leafId: PageId;
  mutations: BTreeMutation[];
}

export interface BTreeOptions {
  indexId: string;
  capacity: number;
  allocator: PageIdAllocator;
}

export class BTree<V> {
  readonly indexId: string;
  readonly capacity: number;
  private readonly allocator: PageIdAllocator;
  private readonly pages = new Map<PageId, Page<V>>();
  private rootId: PageId | null = null;
  private mutations: BTreeMutation[] = [];

  constructor(options: BTreeOptions) {
    this.indexId = options.indexId;
    this.capacity = options.capacity;
    this.allocator = options.allocator;
  }

  get root(): PageId | null {
    return this.rootId;
  }

  getPage(id: PageId): Page<V> {
    const page = this.pages.get(id);
    if (!page) throw new Error(`Page ${id} not found in index ${this.indexId}`);
    return page;
  }

  snapshot(): TreeSnapshot<V> {
    return {
      indexId: this.indexId,
      rootId: this.rootId,
      capacity: this.capacity,
      pages: [...this.pages.values()].map((page) => structuredClone(page)),
    };
  }

  /** Every leaf entry in key order, i.e. what a full index scan would return. */
  entries(): { key: KeyValue; value: V }[] {
    const result: { key: KeyValue; value: V }[] = [];
    let leaf = this.leftmostLeaf();
    while (leaf) {
      result.push(...leaf.entries.map((e) => ({ key: e.key, value: e.value })));
      leaf = leaf.nextLeafId === null ? null : (this.getPage(leaf.nextLeafId) as LeafPage<V>);
    }
    return result;
  }

  search(key: KeyValue): SearchResult<V> {
    if (this.rootId === null) {
      return { path: [], leafId: -1, slot: 0, found: false, value: null };
    }
    const path: PageId[] = [];
    let page = this.getPage(this.rootId);
    path.push(page.id);

    while (page.kind === 'internal') {
      const childId = page.entries[this.childSlotFor(page, key)]!.childId;
      page = this.getPage(childId);
      path.push(page.id);
    }

    const slot = this.leafSlotFor(page, key);
    const entry = page.entries[slot];
    const found = entry !== undefined && compareKeys(entry.key, key) === 0;
    return { path, leafId: page.id, slot, found, value: found ? entry!.value : null };
  }

  insert(key: KeyValue, value: V): MutationResult {
    this.mutations = [];

    if (this.rootId === null) {
      const root = this.createLeaf();
      root.entries.push({ key, value });
      this.rootId = root.id;
      this.record({ type: 'new-root', indexId: this.indexId, pageId: root.id, level: 0 });
      this.record({
        type: 'insert-entry',
        indexId: this.indexId,
        pageId: root.id,
        key,
        slot: 0,
      });
      return { path: [root.id], leafId: root.id, mutations: this.mutations };
    }

    const { path, leafId, slot, found } = this.search(key);
    if (found) {
      throw new DuplicateKeyError(`Duplicate entry '${formatKey(key)}' for index '${this.indexId}'`);
    }

    const leaf = this.getPage(leafId) as LeafPage<V>;
    leaf.entries.splice(slot, 0, { key, value });
    this.record({ type: 'insert-entry', indexId: this.indexId, pageId: leaf.id, key, slot });

    if (slot === 0) this.refreshParentKey(leaf);
    if (leaf.entries.length > this.capacity) this.splitLeaf(leaf);

    return { path, leafId, mutations: this.mutations };
  }

  /** Replaces the payload of an existing key without touching the tree shape. */
  update(key: KeyValue, value: V): MutationResult {
    this.mutations = [];
    const { path, leafId, slot, found } = this.search(key);
    if (!found) throw new Error(`Key '${formatKey(key)}' not found in index '${this.indexId}'`);
    const leaf = this.getPage(leafId) as LeafPage<V>;
    leaf.entries[slot] = { key, value };
    this.record({ type: 'update-entry', indexId: this.indexId, pageId: leaf.id, key });
    return { path, leafId, mutations: this.mutations };
  }

  remove(key: KeyValue): MutationResult {
    this.mutations = [];
    const { path, leafId, slot, found } = this.search(key);
    if (!found) throw new Error(`Key '${formatKey(key)}' not found in index '${this.indexId}'`);

    const leaf = this.getPage(leafId) as LeafPage<V>;
    leaf.entries.splice(slot, 1);
    this.record({ type: 'remove-entry', indexId: this.indexId, pageId: leaf.id, key });

    if (slot === 0 && leaf.entries.length > 0) this.refreshParentKey(leaf);
    this.handleUnderflow(leaf);

    return { path, leafId, mutations: this.mutations };
  }

  /** InnoDB merges a page into a sibling once its fill factor drops below the merge threshold. */
  private get minEntries(): number {
    return Math.floor(this.capacity / 2);
  }

  private handleUnderflow(page: Page<V>): void {
    if (page.parentId === null) {
      this.shrinkRoot(page);
      return;
    }
    if (page.entries.length >= this.minEntries) return;

    const parent = this.getPage(page.parentId) as InternalPage;
    const slot = parent.entries.findIndex((e) => e.childId === page.id);
    const left = slot > 0 ? this.getPage(parent.entries[slot - 1]!.childId) : null;
    const right =
      slot < parent.entries.length - 1 ? this.getPage(parent.entries[slot + 1]!.childId) : null;

    if (left && left.entries.length > this.minEntries) {
      this.borrowFromLeft(page, left);
      return;
    }
    if (right && right.entries.length > this.minEntries) {
      this.borrowFromRight(page, right);
      return;
    }
    if (left) {
      this.mergePages(left, page, parent);
    } else if (right) {
      this.mergePages(page, right, parent);
    }
    this.handleUnderflow(parent);
  }

  private borrowFromLeft(page: Page<V>, left: Page<V>): void {
    const moved = left.entries.pop()!;
    // The two pages are always at the same level, so their entry shapes match.
    (page.entries as typeof left.entries).unshift(moved);
    if (page.kind === 'internal') {
      this.getPage((moved as { childId: PageId }).childId).parentId = page.id;
    }
    this.record({
      type: 'redistribute',
      indexId: this.indexId,
      fromPageId: left.id,
      toPageId: page.id,
      key: moved.key,
      level: page.level,
    });
    this.refreshParentKey(page);
  }

  private borrowFromRight(page: Page<V>, right: Page<V>): void {
    const moved = right.entries.shift()!;
    (page.entries as typeof right.entries).push(moved);
    if (page.kind === 'internal') {
      this.getPage((moved as { childId: PageId }).childId).parentId = page.id;
    }
    this.record({
      type: 'redistribute',
      indexId: this.indexId,
      fromPageId: right.id,
      toPageId: page.id,
      key: moved.key,
      level: page.level,
    });
    this.refreshParentKey(right);
  }

  /** Moves everything from `source` into `target` and unlinks `source` from the tree. */
  private mergePages(target: Page<V>, source: Page<V>, parent: InternalPage): void {
    const movedEntries = source.entries.length;
    (target.entries as typeof source.entries).push(...source.entries);

    if (target.kind === 'internal' && source.kind === 'internal') {
      for (const entry of source.entries) {
        this.getPage(entry.childId).parentId = target.id;
      }
    }

    if (target.kind === 'leaf' && source.kind === 'leaf') {
      target.nextLeafId = source.nextLeafId;
      if (source.nextLeafId !== null) {
        (this.getPage(source.nextLeafId) as LeafPage<V>).prevLeafId = target.id;
      }
    }

    const sourceSlot = parent.entries.findIndex((e) => e.childId === source.id);
    parent.entries.splice(sourceSlot, 1);
    this.pages.delete(source.id);

    this.record({
      type: 'page-merge',
      indexId: this.indexId,
      pageId: target.id,
      removedPageId: source.id,
      level: target.level,
      movedEntries,
    });

    if (sourceSlot === 0) this.refreshParentKey(parent);
  }

  private shrinkRoot(root: Page<V>): void {
    if (root.kind === 'leaf') {
      if (root.entries.length > 0) return;
      this.pages.delete(root.id);
      this.rootId = null;
      this.record({
        type: 'root-shrink',
        indexId: this.indexId,
        removedPageId: root.id,
        newRootId: null,
      });
      return;
    }

    if (root.entries.length > 1) return;
    const child = this.getPage(root.entries[0]!.childId);
    child.parentId = null;
    this.rootId = child.id;
    this.pages.delete(root.id);
    this.record({
      type: 'root-shrink',
      indexId: this.indexId,
      removedPageId: root.id,
      newRootId: child.id,
    });
  }

  private createLeaf(): LeafPage<V> {
    const page: LeafPage<V> = {
      kind: 'leaf',
      id: this.allocator.next(),
      parentId: null,
      level: 0,
      entries: [],
      prevLeafId: null,
      nextLeafId: null,
    };
    this.pages.set(page.id, page);
    return page;
  }

  private createInternal(level: number): InternalPage {
    const page: InternalPage = {
      kind: 'internal',
      id: this.allocator.next(),
      parentId: null,
      level,
      entries: [],
    };
    this.pages.set(page.id, page);
    return page;
  }

  private leftmostLeaf(): LeafPage<V> | null {
    if (this.rootId === null) return null;
    let page = this.getPage(this.rootId);
    while (page.kind === 'internal') {
      page = this.getPage(page.entries[0]!.childId);
    }
    return page;
  }

  /** Index of the child whose subtree can contain `key`. */
  private childSlotFor(page: InternalPage, key: KeyValue): number {
    let slot = 0;
    for (let i = 1; i < page.entries.length; i += 1) {
      if (compareKeys(page.entries[i]!.key, key) <= 0) slot = i;
      else break;
    }
    return slot;
  }

  /** Insert position for `key`, which is also the slot of an equal key when one exists. */
  private leafSlotFor(page: LeafPage<V>, key: KeyValue): number {
    let low = 0;
    let high = page.entries.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (compareKeys(page.entries[mid]!.key, key) < 0) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  private minKeyOf(page: Page<V>): KeyValue {
    return page.entries[0]!.key;
  }

  /**
   * A page's own minimum key is duplicated in its parent record, so shrinking the first key
   * has to be propagated upwards — otherwise a later descent would skip the page.
   */
  private refreshParentKey(page: Page<V>): void {
    if (page.parentId === null || page.entries.length === 0) return;
    const parent = this.getPage(page.parentId) as InternalPage;
    const slot = parent.entries.findIndex((e) => e.childId === page.id);
    if (slot === -1) return;
    const newKey = this.minKeyOf(page);
    const oldKey = parent.entries[slot]!.key;
    if (compareKeys(oldKey, newKey) === 0) return;
    parent.entries[slot] = { key: newKey, childId: page.id };
    this.record({
      type: 'parent-key-update',
      indexId: this.indexId,
      pageId: parent.id,
      oldKey,
      newKey,
    });
    if (slot === 0) this.refreshParentKey(parent);
  }

  private splitLeaf(leaf: LeafPage<V>): void {
    const mid = Math.ceil(leaf.entries.length / 2);
    const right = this.createLeaf();
    right.entries = leaf.entries.splice(mid);

    right.nextLeafId = leaf.nextLeafId;
    right.prevLeafId = leaf.id;
    leaf.nextLeafId = right.id;
    if (right.nextLeafId !== null) {
      (this.getPage(right.nextLeafId) as LeafPage<V>).prevLeafId = right.id;
    }

    const separatorKey = this.minKeyOf(right);
    this.record({
      type: 'page-split',
      indexId: this.indexId,
      pageId: leaf.id,
      newPageId: right.id,
      separatorKey,
      level: 0,
      movedEntries: right.entries.length,
    });

    this.linkToParent(leaf, right, separatorKey);
  }

  private splitInternal(page: InternalPage): void {
    const mid = Math.ceil(page.entries.length / 2);
    const right = this.createInternal(page.level);
    right.entries = page.entries.splice(mid);
    for (const entry of right.entries) {
      this.getPage(entry.childId).parentId = right.id;
    }

    const separatorKey = right.entries[0]!.key;
    this.record({
      type: 'page-split',
      indexId: this.indexId,
      pageId: page.id,
      newPageId: right.id,
      separatorKey,
      level: page.level,
      movedEntries: right.entries.length,
    });

    this.linkToParent(page, right, separatorKey);
  }

  private linkToParent(left: Page<V>, right: Page<V>, separatorKey: KeyValue): void {
    if (left.parentId === null) {
      const root = this.createInternal(left.level + 1);
      root.entries = [
        { key: this.minKeyOf(left), childId: left.id },
        { key: separatorKey, childId: right.id },
      ];
      left.parentId = root.id;
      right.parentId = root.id;
      this.rootId = root.id;
      this.record({ type: 'new-root', indexId: this.indexId, pageId: root.id, level: root.level });
      return;
    }

    const parent = this.getPage(left.parentId) as InternalPage;
    const leftSlot = parent.entries.findIndex((e) => e.childId === left.id);
    parent.entries.splice(leftSlot + 1, 0, { key: separatorKey, childId: right.id });
    right.parentId = parent.id;
    this.record({
      type: 'insert-entry',
      indexId: this.indexId,
      pageId: parent.id,
      key: separatorKey,
      slot: leftSlot + 1,
    });

    if (parent.entries.length > this.capacity) this.splitInternal(parent);
  }

  private record(mutation: BTreeMutation): void {
    this.mutations.push(mutation);
  }
}

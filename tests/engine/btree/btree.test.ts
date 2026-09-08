import { describe, expect, it } from 'vitest';
import { BTree, createPageIdAllocator } from '../../../src/engine/btree/btree';
import { DuplicateKeyError, type LeafPage } from '../../../src/engine/btree/types';

function makeTree(capacity = 4) {
  return new BTree<string>({
    indexId: 'PRIMARY',
    capacity,
    allocator: createPageIdAllocator(),
  });
}

function insertMany(tree: BTree<string>, keys: number[]) {
  for (const key of keys) tree.insert([key], `row${key}`);
}

/** Leaf keys page by page, left to right, following the leaf sibling links. */
function leafLayout(tree: BTree<string>): number[][] {
  const snapshot = tree.snapshot();
  const leaves = snapshot.pages.filter((p): p is LeafPage<string> => p.kind === 'leaf');
  const first = leaves.find((l) => l.prevLeafId === null);
  const layout: number[][] = [];
  let current = first;
  while (current) {
    layout.push(current.entries.map((e) => e.key[0] as number));
    current = leaves.find((l) => l.id === current!.nextLeafId);
  }
  return layout;
}

describe('BTree insert', () => {
  it('keeps everything in a single root leaf while it fits', () => {
    const tree = makeTree(4);
    insertMany(tree, [1, 2, 3, 4]);

    const snapshot = tree.snapshot();
    expect(snapshot.pages).toHaveLength(1);
    expect(snapshot.pages[0]!.kind).toBe('leaf');
    expect(leafLayout(tree)).toEqual([[1, 2, 3, 4]]);
  });

  it('splits the leaf and grows a new root on overflow', () => {
    const tree = makeTree(4);
    insertMany(tree, [1, 2, 3, 4, 5]);

    // 5 entries in a capacity-4 page: left keeps ceil(5/2)=3, right takes the rest.
    expect(leafLayout(tree)).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);

    const snapshot = tree.snapshot();
    const root = snapshot.pages.find((p) => p.id === snapshot.rootId)!;
    expect(root.kind).toBe('internal');
    expect(root.entries.map((e) => e.key[0])).toEqual([1, 4]);
    expect(root.level).toBe(1);
  });

  it('reports the split as a mutation so the log and the UI can react to it', () => {
    const tree = makeTree(4);
    insertMany(tree, [1, 2, 3, 4]);
    const { mutations } = tree.insert([5], 'row5');

    expect(mutations.map((m) => m.type)).toEqual([
      'insert-entry',
      'page-split',
      'new-root',
    ]);
    expect(mutations).toContainEqual(
      expect.objectContaining({ type: 'page-split', separatorKey: [4], movedEntries: 2 }),
    );
  });

  it('keeps leaf pages doubly linked after a split', () => {
    const tree = makeTree(4);
    insertMany(tree, [1, 2, 3, 4, 5]);

    const leaves = tree
      .snapshot()
      .pages.filter((p): p is LeafPage<string> => p.kind === 'leaf')
      .sort((a, b) => (a.entries[0]!.key[0] as number) - (b.entries[0]!.key[0] as number));

    expect(leaves[0]!.prevLeafId).toBeNull();
    expect(leaves[0]!.nextLeafId).toBe(leaves[1]!.id);
    expect(leaves[1]!.prevLeafId).toBe(leaves[0]!.id);
    expect(leaves[1]!.nextLeafId).toBeNull();
  });

  it('splits internal pages and adds a level once the root overflows', () => {
    const tree = makeTree(4);
    insertMany(tree, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

    const snapshot = tree.snapshot();
    const root = snapshot.pages.find((p) => p.id === snapshot.rootId)!;
    expect(root.level).toBeGreaterThanOrEqual(2);
    expect(tree.entries().map((e) => e.key[0])).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });

  it('keeps keys ordered when they arrive in random order', () => {
    const tree = makeTree(4);
    insertMany(tree, [50, 10, 30, 70, 20, 60, 90, 40, 80, 5]);

    expect(tree.entries().map((e) => e.key[0])).toEqual([5, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
    for (const key of [5, 40, 90]) {
      expect(tree.search([key]).found).toBe(true);
    }
    expect(tree.search([55]).found).toBe(false);
  });

  it('propagates a shrinking minimum key up to the parent record', () => {
    const tree = makeTree(4);
    insertMany(tree, [10, 20, 30, 40, 50]);
    const { mutations } = tree.insert([1], 'row1');

    expect(mutations).toContainEqual(
      expect.objectContaining({ type: 'parent-key-update', oldKey: [10], newKey: [1] }),
    );
    expect(tree.search([1]).found).toBe(true);
  });

  it('rejects duplicate keys', () => {
    const tree = makeTree(4);
    insertMany(tree, [1, 2]);
    expect(() => tree.insert([2], 'again')).toThrow(DuplicateKeyError);
  });
});

describe('BTree search', () => {
  it('returns the root-to-leaf path that a lookup has to read', () => {
    const tree = makeTree(4);
    insertMany(tree, [1, 2, 3, 4, 5, 6, 7, 8]);

    const result = tree.search([7]);
    expect(result.found).toBe(true);
    expect(result.value).toBe('row7');
    expect(result.path[0]).toBe(tree.root);
    expect(result.path.at(-1)).toBe(result.leafId);
    expect(result.path.length).toBeGreaterThan(1);
  });
});

describe('BTree update', () => {
  it('replaces a payload without changing the tree shape', () => {
    const tree = makeTree(4);
    insertMany(tree, [1, 2, 3, 4, 5]);
    const before = tree.snapshot().pages.length;

    const { mutations } = tree.update([3], 'changed');

    expect(mutations.map((m) => m.type)).toEqual(['update-entry']);
    expect(tree.search([3]).value).toBe('changed');
    expect(tree.snapshot().pages).toHaveLength(before);
  });
});

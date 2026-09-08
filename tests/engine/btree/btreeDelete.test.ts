import { describe, expect, it } from 'vitest';
import { BTree, createPageIdAllocator } from '../../../src/engine/btree/btree';
import type { LeafPage } from '../../../src/engine/btree/types';

function makeTree(capacity = 4) {
  return new BTree<string>({ indexId: 'PRIMARY', capacity, allocator: createPageIdAllocator() });
}

function insertMany(tree: BTree<string>, keys: number[]) {
  for (const key of keys) tree.insert([key], `row${key}`);
}

function leafLayout(tree: BTree<string>): number[][] {
  const leaves = tree
    .snapshot()
    .pages.filter((p): p is LeafPage<string> => p.kind === 'leaf');
  const layout: number[][] = [];
  let current = leaves.find((l) => l.prevLeafId === null);
  while (current) {
    layout.push(current.entries.map((e) => e.key[0] as number));
    current = leaves.find((l) => l.id === current!.nextLeafId);
  }
  return layout;
}

function keys(tree: BTree<string>): number[] {
  return tree.entries().map((e) => e.key[0] as number);
}

describe('BTree remove', () => {
  it('removes an entry from a page that stays comfortably filled', () => {
    const tree = makeTree(4);
    insertMany(tree, [1, 2, 3, 4]);

    const { mutations } = tree.remove([2]);

    expect(mutations.map((m) => m.type)).toEqual(['remove-entry']);
    expect(keys(tree)).toEqual([1, 3, 4]);
  });

  it('borrows from a sibling instead of merging when the sibling has spare entries', () => {
    const tree = makeTree(4);
    insertMany(tree, [1, 2, 3, 4, 5, 6, 7]);
    expect(leafLayout(tree)).toEqual([
      [1, 2, 3],
      [4, 5, 6, 7],
    ]);

    // capacity 4 means a page underflows at fewer than 2 entries, so the left page has to
    // drop to a single entry before a sibling is asked for one.
    tree.remove([2]);
    const { mutations } = tree.remove([3]);

    expect(mutations.map((m) => m.type)).toContain('redistribute');
    expect(mutations.map((m) => m.type)).not.toContain('page-merge');
    expect(leafLayout(tree)).toEqual([
      [1, 4],
      [5, 6, 7],
    ]);
    expect(keys(tree)).toEqual([1, 4, 5, 6, 7]);
  });

  it('merges two half-empty leaves and collapses the root that is left with one child', () => {
    const tree = makeTree(4);
    insertMany(tree, [1, 2, 3, 4, 5]);
    expect(leafLayout(tree)).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);

    tree.remove([1]);
    const { mutations } = tree.remove([2]);

    expect(mutations.map((m) => m.type)).toEqual(
      expect.arrayContaining(['remove-entry', 'page-merge', 'root-shrink']),
    );
    expect(leafLayout(tree)).toEqual([[3, 4, 5]]);
    expect(tree.getPage(tree.root!).kind).toBe('leaf');
  });

  it('keeps leaf links consistent after a merge', () => {
    const tree = makeTree(4);
    insertMany(tree, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const key of [4, 5, 6]) tree.remove([key]);

    const leaves = tree
      .snapshot()
      .pages.filter((p): p is LeafPage<string> => p.kind === 'leaf');
    const walked = leafLayout(tree).flat();

    expect(walked).toEqual(keys(tree));
    expect(leaves.filter((l) => l.prevLeafId === null)).toHaveLength(1);
    expect(leaves.filter((l) => l.nextLeafId === null)).toHaveLength(1);
  });

  it('empties the tree when the last entry goes away', () => {
    const tree = makeTree(4);
    insertMany(tree, [1, 2]);
    tree.remove([1]);
    const { mutations } = tree.remove([2]);

    expect(mutations).toContainEqual(expect.objectContaining({ type: 'root-shrink', newRootId: null }));
    expect(tree.root).toBeNull();
    expect(keys(tree)).toEqual([]);
  });

  it('survives deleting every key of a multi-level tree in a scrambled order', () => {
    const tree = makeTree(4);
    const all = Array.from({ length: 30 }, (_, i) => i + 1);
    insertMany(tree, all);

    const scrambled = [...all].sort((a, b) => ((a * 7) % 31) - ((b * 7) % 31));
    const remaining = new Set(all);
    for (const key of scrambled) {
      tree.remove([key]);
      remaining.delete(key);
      expect(keys(tree)).toEqual([...remaining].sort((a, b) => a - b));
    }
    expect(tree.root).toBeNull();
  });
});

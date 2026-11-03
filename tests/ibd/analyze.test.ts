/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyze, readPage, type IbdSpace } from '../../src/ibd/analyze';
import { checkPage } from '../../src/ibd/checksum';
import { parseFilHeader } from '../../src/ibd/fil';
import {
  directorySlots,
  freeRecords,
  parseIndexHeader,
  PAGE_NEW_INFIMUM,
  PAGE_NEW_SUPREMUM,
  walkRecords,
} from '../../src/ibd/indexPage';
import { bytesSource } from '../../src/ibd/source';

// Built by scripts/make-sample-ibd.sh: sample.users, 10000 rows, every 50th from 25 deleted,
// a 20KB bio every 1000th row, KEY idx_name (name).
const users = new Uint8Array(gunzipSync(readFileSync('public/samples/users.ibd.gz')));
const zipped = new Uint8Array(readFileSync('tests/fixtures/zipped.ibd'));

let space: IbdSpace;

beforeAll(async () => {
  space = await analyze(bytesSource(users, 'users.ibd'));
});

describe('space header', () => {
  it('reads the page size and size from page 0', () => {
    expect(space.pageSize).toBe(16384);
    expect(space.pageCount).toBe(users.length / 16384);
    expect(space.fsp.size).toBe(space.pageCount);
    expect(space.flags.sdi).toBe(true);
    expect(space.flags.atomicBlobs).toBe(true);
    expect(space.unsupported).toEqual([]);
  });

  it('has the fixed pages at their fixed numbers', () => {
    expect(space.pages.slice(0, 4).map((page) => page.type)).toEqual([8, 5, 3, 17853]);
  });

  it('marks everything past FSP_FREE_LIMIT as not initialised', () => {
    expect(space.allocation[space.fsp.freeLimit]).toBe('uninit');
    expect(space.allocation[0]).toBe('used');
  });
});

describe('checksums', () => {
  it('match crc32 on every page', () => {
    for (let pageNo = 0; pageNo < space.pageCount; pageNo++) {
      const page = users.subarray(pageNo * 16384, (pageNo + 1) * 16384);
      const check = checkPage(page);
      expect(check.checksumOk, `page ${pageNo}`).toBe(true);
      expect(check.lsnOk, `page ${pageNo}`).toBe(true);
    }
  });

  it('notices a flipped byte', () => {
    const page = users.slice(4 * 16384, 5 * 16384);
    page[200] = page[200]! ^ 0xff;
    expect(checkPage(page).checksumOk).toBe(false);
  });
});

describe('table definition', () => {
  it('comes out of the SDI page', () => {
    const table = space.sdi?.table;
    expect(space.sdi?.errors).toEqual([]);
    expect(table?.schema).toBe('sample');
    expect(table?.name).toBe('users');
    expect(table?.rowFormat).toBe('DYNAMIC');
    expect(table?.columns.filter((c) => !c.hidden).map((c) => c.name)).toEqual([
      'id',
      'name',
      'email',
      'bio',
      'created_at',
    ]);
    expect(table?.columns.filter((c) => c.hidden).map((c) => c.name)).toEqual(['DB_TRX_ID', 'DB_ROLL_PTR']);
  });
});

describe('indexes and segments', () => {
  it('finds each B+tree by its root page and names it from the SDI', () => {
    expect(space.indexes.map((index) => [index.name, index.kind, index.root])).toEqual([
      ['SDI', 'sdi', 3],
      ['PRIMARY', 'clustered', 4],
      ['idx_name', 'secondary', 5],
    ]);
    const primary = space.indexes[1]!;
    expect(primary.columns).toEqual(['id']);
    expect(primary.height).toBe(2);
    expect(space.indexes[2]!.columns).toEqual(['name']);
  });

  it('gives every index a leaf and a non-leaf segment', () => {
    for (const index of space.indexes) {
      expect(index.leaf, index.name).not.toBeNull();
      expect(index.nonLeaf, index.name).not.toBeNull();
      expect(index.leaf!.entry.magicOk).toBe(true);
    }
  });

  it('puts the root in the non-leaf segment', () => {
    for (const index of space.indexes) {
      expect(space.owners[index.root]).toEqual({ index: space.indexes.indexOf(index), segment: 'nonleaf' });
    }
  });

  it('allocates LOB pages from the clustered index leaf segment', () => {
    const lobPages = space.pages.filter((page) => page.type === 24 || page.type === 23);
    expect(lobPages.length).toBeGreaterThan(0);
    for (const page of lobPages) {
      if (space.allocation[page.pageNo] !== 'used') continue;
      expect(space.owners[page.pageNo], `page ${page.pageNo}`).toEqual({ index: 1, segment: 'leaf' });
    }
  });

  it('owns whole extents once a segment has used its 32 fragment pages', () => {
    const leaf = space.indexes[1]!.leaf!;
    expect(leaf.entry.fragPages).toHaveLength(32);
    expect(leaf.extents.length).toBeGreaterThan(0);
  });

  it('counts every live row exactly once across the clustered leaves', () => {
    const leaves = space.pages.filter(
      (page) => page.indexId === space.indexes[1]!.id && page.level === 0 && space.allocation[page.pageNo] === 'used',
    );
    const rows = leaves.reduce((sum, page) => sum + page.nRecs, 0);
    // 10000 inserted, 200 deleted; deleted rows not yet purged still count as records.
    expect(rows).toBeGreaterThanOrEqual(9800);
    expect(rows).toBeLessThanOrEqual(10000);
  });
});

describe('index page', () => {
  it('walks the records from infimum to supremum in key order', async () => {
    const page = await readPage(space, 4);
    const header = parseIndexHeader(page);
    const { records, broken } = walkRecords(page, header);
    expect(broken).toBeNull();
    expect(records[0]!.origin).toBe(PAGE_NEW_INFIMUM);
    expect(records[0]!.status).toBe('infimum');
    expect(records.at(-1)!.origin).toBe(PAGE_NEW_SUPREMUM);
    expect(records.length).toBe(header.nRecs + 2);
    // Root is a non-leaf page: every user record is a node pointer.
    expect(records.slice(1, -1).every((record) => record.status === 'node-pointer')).toBe(true);
    // The leftmost node pointer on a non-leaf level carries min_rec_mask.
    expect(records[1]!.minRec).toBe(true);
  });

  it('has directory slots that own every record exactly once', async () => {
    const page = await readPage(space, 4);
    const header = parseIndexHeader(page);
    const slots = directorySlots(page, header);
    expect(slots[0]).toBe(PAGE_NEW_INFIMUM);
    expect(slots.at(-1)).toBe(PAGE_NEW_SUPREMUM);
    const { records } = walkRecords(page, header);
    const owned = records.filter((record) => slots.includes(record.origin));
    expect(owned.reduce((sum, record) => sum + record.nOwned, 0)).toBe(records.length);
  });

  it('keeps the purged rows of a leaf in the PAGE_FREE chain', async () => {
    const leafNo = space.pages.find(
      (page) => page.indexId === space.indexes[1]!.id && page.level === 0 && space.allocation[page.pageNo] === 'used',
    )!.pageNo;
    const page = await readPage(space, leafNo);
    const header = parseIndexHeader(page);
    const free = freeRecords(page, header);
    expect(free.broken).toBeNull();
    expect(free.records.length).toBeGreaterThan(0);
    const live = walkRecords(page, header).records.length - 2;
    // Every record ever placed is either still in the chain or in the free list.
    expect(live + free.records.length).toBe(header.nHeap - 2);
  });

  it('reads FIL_PAGE_OFFSET equal to the position for every written page', () => {
    expect(space.pages.filter((page) => page.misplaced)).toEqual([]);
    expect(parseFilHeader(users.subarray(16384 * 4)).pageNo).toBe(4);
  });
});

describe('ROW_FORMAT=COMPRESSED', () => {
  it('is recognised from the flags and read with its smaller page size', async () => {
    const zip = await analyze(bytesSource(zipped, 'zipped.ibd'));
    expect(zip.flags.zipSsize).toBe(4);
    expect(zip.pageSize).toBe(8192);
    expect(zip.flags.logicalPageSize).toBe(16384);
    expect(zip.unsupported).toContain('compressed');
    expect(zip.pages[0]!.type).toBe(8);
    expect(zip.pages.every((page) => !page.misplaced)).toBe(true);
  });
});

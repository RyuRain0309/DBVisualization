import { parseFilHeader } from './fil';
import {
  FSP_SPACE_FLAGS_OFFSET,
  pagesPerExtent,
  parseFspHeader,
  parseSpaceFlags,
  parseXdesPage,
  xdesInterval,
  type FspHeader,
  type SpaceFlags,
  type XdesEntry,
} from './fsp';
import { parseInodePage, type InodeEntry } from './inode';
import { fillRatio, isRootPage, parseIndexHeader, type FsegHeader, type IndexPageHeader } from './indexPage';
import {
  FIL_PAGE_INODE,
  FIL_PAGE_SDI,
  FIL_PAGE_TYPE_FSP_HDR,
  FIL_PAGE_TYPE_XDES,
  isIndexLike,
} from './pageTypes';
import { decodeSdi, readSdiEntries, type SdiEntry, type SdiResult } from './sdi';
import { u32 } from './bytes';
import type { IbdSource } from './source';

/** What the map knows about each page without opening it. */
export interface PageSummary {
  pageNo: number;
  /** FIL_PAGE_TYPE */
  type: number;
  /** FIL_PAGE_LSN is 0: the page has never been written. */
  neverWritten: boolean;
  /** FIL_PAGE_OFFSET differs from the page's position in the file. */
  misplaced: boolean;
  /** B+tree pages only; -1 otherwise. */
  level: number;
  indexId: bigint | null;
  nRecs: number;
  /** 0..1, B+tree pages only. */
  fill: number;
}

export type Allocation = 'used' | 'free' | 'uninit';

export interface SegmentInfo {
  segId: bigint;
  inodePage: number;
  entry: InodeEntry;
  /** Extents the segment owns whole, from XDES_ID. */
  extents: number[];
  /** Pages in use: its fragment pages plus the used pages of its extents. */
  pages: number[];
}

export type IndexKind = 'clustered' | 'secondary' | 'sdi' | 'unknown';

export interface IndexInfo {
  id: bigint;
  name: string;
  kind: IndexKind;
  root: number;
  /** PAGE_LEVEL of the root + 1. */
  height: number;
  columns: string[];
  leaf: SegmentInfo | null;
  nonLeaf: SegmentInfo | null;
}

export interface PageOwner {
  /** Position in IbdSpace.indexes. */
  index: number;
  segment: 'leaf' | 'nonleaf';
}

export type Unsupported = 'compressed' | 'encrypted' | 'redundant';

export interface IbdSpace {
  source: IbdSource;
  /** Bytes per page in the file. */
  pageSize: number;
  pageCount: number;
  extentPages: number;
  flags: SpaceFlags;
  fsp: FspHeader;
  /** Formats whose page contents this tool does not decode; the map still works from FIL headers. */
  unsupported: Unsupported[];
  pages: PageSummary[];
  xdes: XdesEntry[];
  allocation: Allocation[];
  segments: SegmentInfo[];
  indexes: IndexInfo[];
  owners: (PageOwner | null)[];
  sdi: SdiResult | null;
}

export class IbdError extends Error {}

const CHUNK_BYTES = 4 * 1024 * 1024;

const SDI_INDEX_ID = 0xffffffffffffffffn;

export async function analyze(
  source: IbdSource,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<IbdSpace> {
  if (source.size < 1024) throw new IbdError('파일이 너무 작다. .ibd 파일은 최소 한 페이지(4KB 이상)다.');

  const head = await source.read(0, 1024);
  const first = parseFilHeader(head);
  if (first.type !== FIL_PAGE_TYPE_FSP_HDR) {
    throw new IbdError(
      `0번 페이지의 FIL_PAGE_TYPE 이 FSP_HDR(8) 이 아니라 ${first.type} 이다. .ibd 파일이 아니거나 손상된 파일이다.`,
    );
  }
  const flags = parseSpaceFlags(u32(head, FSP_SPACE_FLAGS_OFFSET));
  const pageSize = flags.physicalPageSize;
  const pageCount = Math.floor(source.size / pageSize);

  const unsupported: Unsupported[] = [];
  if (flags.zipSsize !== 0) unsupported.push('compressed');
  if (flags.encrypted) unsupported.push('encrypted');
  if (!flags.postAntelope) unsupported.push('redundant');
  // Page contents are readable only when they are stored as plain, uncompressed pages.
  const readable = flags.zipSsize === 0 && !flags.encrypted;

  const pages: PageSummary[] = [];
  const xdes: XdesEntry[] = [];
  const inodes: { pageNo: number; entries: InodeEntry[] }[] = [];
  const roots: { pageNo: number; type: number; header: IndexPageHeader }[] = [];
  const sdiEntries: SdiEntry[] = [];
  let fsp: FspHeader | null = null;

  const chunkPages = Math.max(1, Math.floor(CHUNK_BYTES / pageSize));
  for (let start = 0; start < pageCount; start += chunkPages) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const count = Math.min(chunkPages, pageCount - start);
    const chunk = await source.read(start * pageSize, count * pageSize);
    for (let i = 0; i < count; i++) {
      const pageNo = start + i;
      const page = chunk.subarray(i * pageSize, (i + 1) * pageSize);
      const fil = parseFilHeader(page);
      const neverWritten = fil.lsn === 0n && fil.type === 0;
      const summary: PageSummary = {
        pageNo,
        type: fil.type,
        neverWritten,
        misplaced: !neverWritten && fil.pageNo !== pageNo,
        level: -1,
        indexId: null,
        nRecs: 0,
        fill: 0,
      };
      pages.push(summary);
      if (pageNo === 0) fsp = parseFspHeader(page);
      if (!readable || neverWritten) continue;

      if (isIndexLike(fil.type)) {
        const header = parseIndexHeader(page);
        summary.level = header.level;
        summary.indexId = header.indexId;
        summary.nRecs = header.nRecs;
        summary.fill = fillRatio(pageSize, header);
        if (isRootPage(header)) roots.push({ pageNo, type: fil.type, header });
        if (fil.type === FIL_PAGE_SDI && header.level === 0) sdiEntries.push(...readSdiEntries(page));
      } else if (fil.type === FIL_PAGE_INODE) {
        inodes.push({ pageNo, entries: parseInodePage(page, pageSize) });
      } else if (
        pageNo % xdesInterval(pageSize) === 0 &&
        (fil.type === FIL_PAGE_TYPE_FSP_HDR || fil.type === FIL_PAGE_TYPE_XDES)
      ) {
        xdes.push(...parseXdesPage(page, pageNo, pageSize));
      }
    }
    onProgress?.(Math.min(start + count, pageCount), pageCount);
  }

  const space: IbdSpace = {
    source,
    pageSize,
    pageCount,
    // Extent size follows innodb_page_size, also for compressed tables whose pages are smaller.
    extentPages: pagesPerExtent(flags.logicalPageSize),
    flags,
    fsp: fsp!,
    unsupported,
    pages,
    xdes,
    allocation: [],
    segments: [],
    indexes: [],
    owners: new Array(pageCount).fill(null),
    sdi: null,
  };
  if (!readable) {
    space.allocation = new Array(pageCount).fill('used');
    return space;
  }

  space.allocation = allocationOf(space);
  space.segments = segmentsOf(space, inodes);
  space.sdi = sdiEntries.length > 0 ? await decodeSdi(sdiEntries) : null;
  space.indexes = indexesOf(space, roots);
  assignOwners(space);
  return space;
}

/** Free or used, per page, from the XDES free bits; past FSP_FREE_LIMIT nothing is initialised yet. */
function allocationOf(space: IbdSpace): Allocation[] {
  const byExtent = new Map(space.xdes.map((entry) => [entry.extent, entry]));
  return space.pages.map(({ pageNo }) => {
    if (pageNo >= space.fsp.freeLimit) return 'uninit';
    const entry = byExtent.get(Math.floor(pageNo / space.extentPages));
    if (!entry || entry.state === 'NOT_INITED') return 'uninit';
    return entry.free[pageNo % space.extentPages] ? 'free' : 'used';
  });
}

function segmentsOf(space: IbdSpace, inodes: { pageNo: number; entries: InodeEntry[] }[]): SegmentInfo[] {
  const segments: SegmentInfo[] = [];
  for (const { pageNo, entries } of inodes) {
    for (const entry of entries) {
      const extents = space.xdes.filter(
        (x) => x.segId === entry.segId && (x.state === 'FSEG' || x.state === 'FSEG_FRAG'),
      );
      const pages = [...entry.fragPages];
      for (const extent of extents) {
        extent.free.forEach((free, i) => {
          if (!free) pages.push(extent.firstPage + i);
        });
      }
      pages.sort((a, b) => a - b);
      segments.push({ segId: entry.segId, inodePage: pageNo, entry, extents: extents.map((x) => x.extent), pages });
    }
  }
  return segments;
}

function segmentAt(space: IbdSpace, header: FsegHeader): SegmentInfo | null {
  return space.segments.find((s) => s.inodePage === header.page && s.entry.offset === header.offset) ?? null;
}

function indexesOf(space: IbdSpace, roots: { pageNo: number; type: number; header: IndexPageHeader }[]): IndexInfo[] {
  const defined = space.sdi?.table?.indexes ?? [];
  return roots
    .filter((root) => space.allocation[root.pageNo] === 'used')
    .map(({ pageNo, type, header }) => {
      const sdi = type === FIL_PAGE_SDI || header.indexId === SDI_INDEX_ID;
      const definition = defined.find((index) => index.id === header.indexId.toString());
      const kind: IndexKind = sdi
        ? 'sdi'
        : definition
          ? definition.type === 'PRIMARY'
            ? 'clustered'
            : 'secondary'
          : 'unknown';
      return {
        id: header.indexId,
        name: sdi ? 'SDI' : (definition?.name ?? `index ${header.indexId}`),
        kind,
        root: pageNo,
        height: header.level + 1,
        columns: definition?.columns ?? [],
        leaf: segmentAt(space, header.segLeaf),
        nonLeaf: segmentAt(space, header.segTop),
      };
    })
    .sort((a, b) => a.root - b.root);
}

function assignOwners(space: IbdSpace) {
  space.indexes.forEach((index, position) => {
    for (const [segment, kind] of [
      [index.leaf, 'leaf'],
      [index.nonLeaf, 'nonleaf'],
    ] as const) {
      for (const pageNo of segment?.pages ?? []) {
        if (pageNo < space.pageCount) space.owners[pageNo] = { index: position, segment: kind };
      }
    }
  });
}

export function readPage(space: IbdSpace, pageNo: number): Promise<Uint8Array> {
  return space.source.read(pageNo * space.pageSize, space.pageSize);
}

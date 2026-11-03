import { listBase, u32, u64, u8, type ListBase } from './bytes';
import { FIL_HEADER_SIZE } from './fil';

/** FSP_SPACE_FLAGS, bit by bit (fsp0types.h). */
export interface SpaceFlags {
  raw: number;
  /** FSP_FLAGS_POS_POST_ANTELOPE: row format is COMPACT or newer. */
  postAntelope: boolean;
  /** FSP_FLAGS_POS_ZIP_SSIZE: non-zero means ROW_FORMAT=COMPRESSED. */
  zipSsize: number;
  /** FSP_FLAGS_POS_ATOMIC_BLOBS: DYNAMIC or COMPRESSED, long values go off-page whole. */
  atomicBlobs: boolean;
  /** FSP_FLAGS_POS_PAGE_SSIZE: 0 means the default 16KB. */
  pageSsize: number;
  dataDir: boolean;
  shared: boolean;
  temporary: boolean;
  /** FSP_FLAGS_POS_ENCRYPTION */
  encrypted: boolean;
  /** FSP_FLAGS_POS_SDI: the file carries its own table definition. */
  sdi: boolean;
  /** innodb_page_size the server ran with. */
  logicalPageSize: number;
  /** Bytes each page takes in the file: the compressed size for ROW_FORMAT=COMPRESSED. */
  physicalPageSize: number;
}

export function parseSpaceFlags(raw: number): SpaceFlags {
  const bit = (pos: number) => ((raw >>> pos) & 1) === 1;
  const zipSsize = (raw >>> 1) & 0xf;
  const pageSsize = (raw >>> 6) & 0xf;
  const logicalPageSize = pageSsize === 0 ? 16384 : 1 << (pageSsize + 9);
  return {
    raw,
    postAntelope: bit(0),
    zipSsize,
    atomicBlobs: bit(5),
    pageSsize,
    dataDir: bit(10),
    shared: bit(11),
    temporary: bit(12),
    encrypted: bit(13),
    sdi: bit(14),
    logicalPageSize,
    physicalPageSize: zipSsize === 0 ? logicalPageSize : 512 << zipSsize,
  };
}

/** Offset of FSP_SPACE_FLAGS in page 0; the first thing to read, since it decides the page size. */
export const FSP_SPACE_FLAGS_OFFSET = FIL_HEADER_SIZE + 16;

/** FSP header on page 0, right after the FIL header. 112 bytes. */
export interface FspHeader {
  spaceId: number;
  /** FSP_SIZE: the file's size in pages. */
  size: number;
  /** FSP_FREE_LIMIT: pages below this have been initialised into extents; above it, not yet. */
  freeLimit: number;
  flags: SpaceFlags;
  /** FSP_FRAG_N_USED: used pages in the FREE_FRAG extents. */
  fragNUsed: number;
  /** FSP_FREE: whole free extents. */
  free: ListBase;
  /** FSP_FREE_FRAG: extents handed out page by page that still have free pages. */
  freeFrag: ListBase;
  /** FSP_FULL_FRAG: such extents with no free page left. */
  fullFrag: ListBase;
  /** FSP_SEG_ID: the id the next new segment will get. */
  nextSegId: bigint;
  /** FSP_SEG_INODES_FULL / FSP_SEG_INODES_FREE: INODE pages with no free slot / with free slots. */
  inodesFull: ListBase;
  inodesFree: ListBase;
}

export function parseFspHeader(page0: Uint8Array): FspHeader {
  const o = FIL_HEADER_SIZE;
  return {
    spaceId: u32(page0, o),
    size: u32(page0, o + 8),
    freeLimit: u32(page0, o + 12),
    flags: parseSpaceFlags(u32(page0, o + 16)),
    fragNUsed: u32(page0, o + 20),
    free: listBase(page0, o + 24),
    freeFrag: listBase(page0, o + 40),
    fullFrag: listBase(page0, o + 56),
    nextSegId: u64(page0, o + 72),
    inodesFull: listBase(page0, o + 80),
    inodesFree: listBase(page0, o + 96),
  };
}

/** Pages in one extent: always 1MB for pages up to 16KB, and 64 pages above that. */
export function pagesPerExtent(pageSize: number): number {
  return pageSize <= 16384 ? (1024 * 1024) / pageSize : 64;
}

/** An XDES page (page 0 being the first) describes the next `pageSize` pages, then the next one follows. */
export function xdesInterval(pageSize: number): number {
  return pageSize;
}

export type XdesState = 'NOT_INITED' | 'FREE' | 'FREE_FRAG' | 'FULL_FRAG' | 'FSEG' | 'FSEG_FRAG';

const XDES_STATES: XdesState[] = ['NOT_INITED', 'FREE', 'FREE_FRAG', 'FULL_FRAG', 'FSEG', 'FSEG_FRAG'];

/** One extent descriptor (XDES entry): 40 bytes for a 16KB page. */
export interface XdesEntry {
  /** Extent number in the file: extent n covers pages n*pagesPerExtent onwards. */
  extent: number;
  firstPage: number;
  /** Byte offset of this entry in its XDES page. */
  offset: number;
  /** XDES_ID: the owning segment when the state is FSEG, otherwise 0. */
  segId: bigint;
  state: XdesState;
  /** XDES_BITMAP's free bit, one per page: true = free. */
  free: boolean[];
}

/** Where the descriptor array starts: after the FIL header and the FSP header. */
export const XDES_ARRAY_OFFSET = FIL_HEADER_SIZE + 112;

/**
 * Every descriptor on one FSP_HDR/XDES page. Entries past FSP_FREE_LIMIT are left as zeroes by
 * InnoDB, which reads as NOT_INITED here.
 */
export function parseXdesPage(page: Uint8Array, xdesPageNo: number, pageSize: number): XdesEntry[] {
  const perExtent = pagesPerExtent(pageSize);
  const entrySize = 24 + perExtent / 4;
  const count = xdesInterval(pageSize) / perExtent;
  const entries: XdesEntry[] = [];
  for (let i = 0; i < count; i++) {
    const offset = XDES_ARRAY_OFFSET + i * entrySize;
    const free: boolean[] = [];
    for (let p = 0; p < perExtent; p++) {
      const bit = p * 2;
      free.push(((u8(page, offset + 24 + (bit >> 3)) >> (bit & 7)) & 1) === 1);
    }
    const firstPage = xdesPageNo + i * perExtent;
    entries.push({
      extent: firstPage / perExtent,
      firstPage,
      offset,
      segId: u64(page, offset),
      state: XDES_STATES[u32(page, offset + 20)] ?? 'NOT_INITED',
      free,
    });
  }
  return entries;
}

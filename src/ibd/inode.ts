import { FIL_NULL, listBase, u32, u64, type ListBase } from './bytes';
import { FIL_HEADER_SIZE, FIL_TRAILER_SIZE } from './fil';
import { pagesPerExtent } from './fsp';

/** Magic number every in-use INODE entry carries (FSEG_MAGIC_N_VALUE). */
export const FSEG_MAGIC_N_VALUE = 97937874;

/** INODE entries start after the FIL header and the 12-byte list node linking INODE pages. */
const FSEG_ARR_OFFSET = FIL_HEADER_SIZE + 12;

/** One segment's INODE entry. 192 bytes for a 16KB page. */
export interface InodeEntry {
  slot: number;
  /** Byte offset of the entry in its page: what an FSEG header points at. */
  offset: number;
  /** FSEG_ID */
  segId: bigint;
  /** FSEG_NOT_FULL_N_USED: used pages in the NOT_FULL extents. */
  notFullUsed: number;
  /** FSEG_FREE / FSEG_NOT_FULL / FSEG_FULL: the segment's own extents, by how full they are. */
  free: ListBase;
  notFull: ListBase;
  full: ListBase;
  magicOk: boolean;
  /** FSEG_FRAG_ARR: single pages the segment took from shared extents before owning whole ones. */
  fragPages: number[];
}

function entrySize(pageSize: number): number {
  return 64 + (pagesPerExtent(pageSize) / 2) * 4;
}

/** The in-use entries of one INODE page; a slot whose FSEG_ID is 0 is free. */
export function parseInodePage(page: Uint8Array, pageSize: number): InodeEntry[] {
  const size = entrySize(pageSize);
  const slots = Math.floor((pageSize - FSEG_ARR_OFFSET - FIL_TRAILER_SIZE) / size);
  const fragSlots = pagesPerExtent(pageSize) / 2;
  const entries: InodeEntry[] = [];
  for (let slot = 0; slot < slots; slot++) {
    const offset = FSEG_ARR_OFFSET + slot * size;
    const segId = u64(page, offset);
    if (segId === 0n) continue;
    const fragPages: number[] = [];
    for (let i = 0; i < fragSlots; i++) {
      const pageNo = u32(page, offset + 64 + i * 4);
      if (pageNo !== FIL_NULL) fragPages.push(pageNo);
    }
    entries.push({
      slot,
      offset,
      segId,
      notFullUsed: u32(page, offset + 8),
      free: listBase(page, offset + 12),
      notFull: listBase(page, offset + 28),
      full: listBase(page, offset + 44),
      magicOk: u32(page, offset + 60) === FSEG_MAGIC_N_VALUE,
      fragPages,
    });
  }
  return entries;
}

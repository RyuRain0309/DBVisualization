import { u16, u32, u64 } from './bytes';

/** Every page, whatever its type, starts with this 38-byte header and ends with an 8-byte trailer. */
export const FIL_HEADER_SIZE = 38;
export const FIL_TRAILER_SIZE = 8;

export interface FilHeader {
  /** FIL_PAGE_SPACE_OR_CHKSUM */
  checksum: number;
  /** FIL_PAGE_OFFSET: the page's own number, which must match where it sits in the file. */
  pageNo: number;
  /** FIL_PAGE_PREV / FIL_PAGE_NEXT: neighbours on the same B+tree level, FIL_NULL otherwise. */
  prev: number;
  next: number;
  /** FIL_PAGE_LSN: the LSN of the last change written to this page. */
  lsn: bigint;
  /** FIL_PAGE_TYPE */
  type: number;
  /** FIL_PAGE_FILE_FLUSH_LSN: only meaningful on page 0 of the system tablespace. */
  flushLsn: bigint;
  /** FIL_PAGE_SPACE_ID */
  spaceId: number;
}

export function parseFilHeader(page: Uint8Array, base = 0): FilHeader {
  return {
    checksum: u32(page, base),
    pageNo: u32(page, base + 4),
    prev: u32(page, base + 8),
    next: u32(page, base + 12),
    lsn: u64(page, base + 16),
    type: u16(page, base + 24),
    flushLsn: u64(page, base + 26),
    spaceId: u32(page, base + 34),
  };
}

export interface FilTrailer {
  /** The pre-5.7 checksum slot; with crc32 checksums it holds the same value as the header. */
  oldChecksum: number;
  /** Low 32 bits of FIL_PAGE_LSN, written again at the very end to catch a half-written page. */
  lsnLow32: number;
}

export function parseFilTrailer(page: Uint8Array): FilTrailer {
  const end = page.length - FIL_TRAILER_SIZE;
  return { oldChecksum: u32(page, end), lsnLow32: u32(page, end + 4) };
}

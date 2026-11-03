/**
 * Big-endian readers over a page. InnoDB writes every on-disk integer most significant byte first,
 * which is also why a byte-by-byte comparison of two keys gives their sort order.
 */

/** "No page": what an unset page number or list pointer holds. */
export const FIL_NULL = 0xffffffff;

export function u8(b: Uint8Array, o: number): number {
  return b[o]!;
}

export function u16(b: Uint8Array, o: number): number {
  return (b[o]! << 8) | b[o + 1]!;
}

export function i16(b: Uint8Array, o: number): number {
  const v = u16(b, o);
  return v >= 0x8000 ? v - 0x10000 : v;
}

export function u32(b: Uint8Array, o: number): number {
  return b[o]! * 0x1000000 + ((b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!);
}

/** 6-byte values such as DB_TRX_ID still fit a JS number exactly. */
export function u48(b: Uint8Array, o: number): number {
  return u16(b, o) * 0x100000000 + u32(b, o + 2);
}

/** 8-byte values (LSN, index id, segment id) can exceed 2^53, so they stay bigint. */
export function u64(b: Uint8Array, o: number): bigint {
  return (BigInt(u32(b, o)) << 32n) | BigInt(u32(b, o + 4));
}

/** A position inside the tablespace: page number plus byte offset in that page. */
export interface FilAddr {
  page: number;
  offset: number;
}

/** 6 bytes: page number (4) + offset (2). null when the page number is FIL_NULL. */
export function filAddr(b: Uint8Array, o: number): FilAddr | null {
  const page = u32(b, o);
  return page === FIL_NULL ? null : { page, offset: u16(b, o + 4) };
}

/** The head of an on-disk doubly linked list (FLST_BASE_NODE): length, first, last. 16 bytes. */
export interface ListBase {
  length: number;
  first: FilAddr | null;
  last: FilAddr | null;
}

export function listBase(b: Uint8Array, o: number): ListBase {
  return { length: u32(b, o), first: filAddr(b, o + 4), last: filAddr(b, o + 10) };
}

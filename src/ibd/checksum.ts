import { FIL_TRAILER_SIZE, parseFilHeader, parseFilTrailer } from './fil';

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0x82f63b78 : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

/** CRC-32C (Castagnoli), the polynomial behind innodb_checksum_algorithm=crc32. */
export function crc32c(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface PageCheck {
  /** A page of all zeroes was never written; InnoDB treats it as valid. */
  empty: boolean;
  stored: number;
  computed: number;
  checksumOk: boolean;
  /** The low 32 bits of FIL_PAGE_LSN, compared with the copy in the trailer. */
  lsnOk: boolean;
}

/**
 * crc32 checksum as InnoDB computes it: CRC-32C of bytes 4..26 (header after the checksum, up to
 * FIL_PAGE_FILE_FLUSH_LSN) XOR CRC-32C of bytes 38..size-8 (body). The flush LSN and space id are
 * left out because they are rewritten without recomputing the checksum.
 */
export function checkPage(page: Uint8Array): PageCheck {
  const empty = page.every((byte) => byte === 0);
  const header = parseFilHeader(page);
  const computed = (crc32c(page, 4, 26) ^ crc32c(page, 38, page.length - FIL_TRAILER_SIZE)) >>> 0;
  const lsnLow32 = Number(header.lsn & 0xffffffffn);
  return {
    empty,
    stored: header.checksum,
    computed,
    checksumOk: empty || header.checksum === computed,
    lsnOk: empty || parseFilTrailer(page).lsnLow32 === lsnLow32,
  };
}

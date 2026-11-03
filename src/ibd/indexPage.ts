import { i16, u16, u32, u64, u8 } from './bytes';
import { FIL_HEADER_SIZE, FIL_TRAILER_SIZE } from './fil';

/** An FSEG header: where in the INODE pages a segment's entry lives. 10 bytes. */
export interface FsegHeader {
  space: number;
  page: number;
  offset: number;
}

function fsegHeader(page: Uint8Array, o: number): FsegHeader {
  return { space: u32(page, o), page: u32(page, o + 4), offset: u16(page, o + 8) };
}

/** The page header (36 bytes) and the two FSEG headers (20 bytes) that follow the FIL header. */
export interface IndexPageHeader {
  /** PAGE_N_DIR_SLOTS */
  nDirSlots: number;
  /** PAGE_HEAP_TOP: end of the record heap; free space starts here. */
  heapTop: number;
  /** PAGE_N_HEAP, without its top bit: records ever placed on the heap, infimum and supremum included. */
  nHeap: number;
  /** The top bit of PAGE_N_HEAP: COMPACT/DYNAMIC (true) or REDUNDANT (false) record format. */
  compact: boolean;
  /** PAGE_FREE: first record in the chain of purged records whose space can be reused. 0 = none. */
  free: number;
  /** PAGE_GARBAGE: bytes held by those purged records. */
  garbage: number;
  /** PAGE_LAST_INSERT: the record inserted last. 0 after a delete or reorganise. */
  lastInsert: number;
  /** PAGE_DIRECTION / PAGE_N_DIRECTION: which way consecutive inserts have been heading. */
  direction: number;
  nDirection: number;
  /** PAGE_N_RECS: user records, not counting infimum and supremum. */
  nRecs: number;
  /** PAGE_MAX_TRX_ID: largest trx id that modified a record here; kept on secondary index leaves. */
  maxTrxId: bigint;
  /** PAGE_LEVEL: 0 for leaves. */
  level: number;
  /** PAGE_INDEX_ID */
  indexId: bigint;
  /** PAGE_BTR_SEG_LEAF / PAGE_BTR_SEG_TOP: set only on the root page. */
  segLeaf: FsegHeader;
  segTop: FsegHeader;
}

const PAGE_HEADER = FIL_HEADER_SIZE;

export function parseIndexHeader(page: Uint8Array): IndexPageHeader {
  const o = PAGE_HEADER;
  const nHeapRaw = u16(page, o + 4);
  return {
    nDirSlots: u16(page, o),
    heapTop: u16(page, o + 2),
    nHeap: nHeapRaw & 0x7fff,
    compact: (nHeapRaw & 0x8000) !== 0,
    free: u16(page, o + 6),
    garbage: u16(page, o + 8),
    lastInsert: u16(page, o + 10),
    direction: u16(page, o + 12),
    nDirection: u16(page, o + 14),
    nRecs: u16(page, o + 16),
    maxTrxId: u64(page, o + 18),
    level: u16(page, o + 26),
    indexId: u64(page, o + 28),
    segLeaf: fsegHeader(page, o + 36),
    segTop: fsegHeader(page, o + 46),
  };
}

/** A root page is the one whose FSEG headers point at INODE entries; the rest leave them zero. */
export function isRootPage(header: IndexPageHeader): boolean {
  return header.segLeaf.page !== 0 || header.segTop.page !== 0;
}

/** Where infimum and supremum sit in a COMPACT page, as record origins (just after their 5-byte header). */
export const PAGE_NEW_INFIMUM = 99;
export const PAGE_NEW_SUPREMUM = 112;
/** End of supremum: user records are placed from here up to PAGE_HEAP_TOP. */
export const PAGE_NEW_SUPREMUM_END = 120;
/** FIL header + page header + FSEG headers: where infimum's record header starts. */
export const PAGE_DATA = 94;

/** Bytes a record of the given page may use at most: half the free space of an empty page. */
export function emptyPageFreeSpace(pageSize: number): number {
  return pageSize - PAGE_NEW_SUPREMUM_END - 2 * 2 - FIL_TRAILER_SIZE;
}

export type RecordStatus = 'ordinary' | 'node-pointer' | 'infimum' | 'supremum';

const STATUS: RecordStatus[] = ['ordinary', 'node-pointer', 'infimum', 'supremum'];

/** The 5-byte COMPACT record header, read backwards from the record's origin. */
export interface RecordHeader {
  /** Byte offset of the record's origin: where the header ends and the values start. */
  origin: number;
  /** delete_mask */
  deleted: boolean;
  /** min_rec_mask */
  minRec: boolean;
  /** n_owned: set only on the record a directory slot points at. */
  nOwned: number;
  /** heap_no */
  heapNo: number;
  /** record_type */
  status: RecordStatus;
  /** next_record resolved to an absolute offset; 0 when the record is the last in its chain. */
  next: number;
}

export function readRecordHeader(page: Uint8Array, origin: number): RecordHeader {
  const info = u8(page, origin - 5);
  const heap = u16(page, origin - 4);
  const relative = i16(page, origin - 2);
  return {
    origin,
    deleted: (info & 0x20) !== 0,
    minRec: (info & 0x10) !== 0,
    nOwned: info & 0x0f,
    heapNo: heap >> 3,
    status: STATUS[heap & 0x7] ?? 'ordinary',
    next: relative === 0 ? 0 : (origin + relative) & (page.length - 1),
  };
}

export interface RecordChain {
  records: RecordHeader[];
  /** Set when the chain loops or leaves the page before reaching its end. */
  broken: string | null;
}

function follow(page: Uint8Array, start: number, stopAt: number | null, limit: number): RecordChain {
  const records: RecordHeader[] = [];
  const seen = new Set<number>();
  let origin = start;
  while (origin !== 0) {
    if (origin < PAGE_NEW_INFIMUM || origin >= page.length - FIL_TRAILER_SIZE) {
      return { records, broken: `페이지 범위를 벗어난 위치 ${origin} 를 가리킨다` };
    }
    if (seen.has(origin) || records.length > limit) {
      return { records, broken: `위치 ${origin} 에서 같은 레코드로 되돌아온다` };
    }
    seen.add(origin);
    const record = readRecordHeader(page, origin);
    records.push(record);
    if (origin === stopAt) break;
    origin = record.next;
  }
  return { records, broken: null };
}

/** Records in key order: infimum, user records, supremum, following next_record. */
export function walkRecords(page: Uint8Array, header: IndexPageHeader): RecordChain {
  return follow(page, PAGE_NEW_INFIMUM, PAGE_NEW_SUPREMUM, header.nHeap + 2);
}

/** Purged records whose space can be reused, from PAGE_FREE along next_record. */
export function freeRecords(page: Uint8Array, header: IndexPageHeader): RecordChain {
  return follow(page, header.free, null, header.nHeap);
}

/** PAGE_DIRECTORY: slot 0 is right before the FIL trailer and later slots go towards the start. */
export function directorySlots(page: Uint8Array, header: IndexPageHeader): number[] {
  const slots: number[] = [];
  const end = page.length - FIL_TRAILER_SIZE;
  for (let i = 0; i < header.nDirSlots; i++) slots.push(u16(page, end - 2 * (i + 1)));
  return slots;
}

/** First byte of the page directory: free space runs from PAGE_HEAP_TOP up to here. */
export function directoryStart(pageSize: number, header: IndexPageHeader): number {
  return pageSize - FIL_TRAILER_SIZE - header.nDirSlots * 2;
}

/** Share of an empty page's free space taken by live records (purged garbage not counted). */
export function fillRatio(pageSize: number, header: IndexPageHeader): number {
  const used = header.heapTop - PAGE_NEW_SUPREMUM_END - header.garbage + header.nDirSlots * 2 - 4;
  return Math.max(0, Math.min(1, used / emptyPageFreeSpace(pageSize)));
}

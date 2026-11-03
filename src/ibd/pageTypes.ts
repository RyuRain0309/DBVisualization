/** What FIL_PAGE_TYPE says a page is, grouped for colouring the file map. */
export type PageGroup = 'space' | 'inode' | 'sdi' | 'index' | 'lob' | 'allocated' | 'other';

export interface PageTypeInfo {
  code: number;
  /** The identifier from fil0fil.h. */
  name: string;
  group: PageGroup;
  gloss: string;
}

const TYPES: PageTypeInfo[] = [
  { code: 0, name: 'FIL_PAGE_TYPE_ALLOCATED', group: 'allocated', gloss: '자리만 잡혀 있고 아직 쓴 적 없는 페이지' },
  { code: 2, name: 'FIL_PAGE_UNDO_LOG', group: 'other', gloss: '언두 로그' },
  { code: 3, name: 'FIL_PAGE_INODE', group: 'inode', gloss: '세그먼트 목록' },
  { code: 4, name: 'FIL_PAGE_IBUF_FREE_LIST', group: 'other', gloss: '체인지 버퍼의 빈 페이지 목록' },
  { code: 5, name: 'FIL_PAGE_IBUF_BITMAP', group: 'space', gloss: '체인지 버퍼 비트맵' },
  { code: 6, name: 'FIL_PAGE_TYPE_SYS', group: 'other', gloss: '시스템 페이지' },
  { code: 7, name: 'FIL_PAGE_TYPE_TRX_SYS', group: 'other', gloss: '트랜잭션 시스템 헤더' },
  { code: 8, name: 'FIL_PAGE_TYPE_FSP_HDR', group: 'space', gloss: '파일 공간 헤더와 익스텐트 정보' },
  { code: 9, name: 'FIL_PAGE_TYPE_XDES', group: 'space', gloss: '익스텐트 정보' },
  { code: 10, name: 'FIL_PAGE_TYPE_BLOB', group: 'lob', gloss: '오버플로 페이지 (5.7 이하 형식)' },
  { code: 11, name: 'FIL_PAGE_TYPE_ZBLOB', group: 'lob', gloss: '압축 테이블의 오버플로 첫 페이지' },
  { code: 12, name: 'FIL_PAGE_TYPE_ZBLOB2', group: 'lob', gloss: '압축 테이블의 오버플로 다음 페이지' },
  { code: 13, name: 'FIL_PAGE_TYPE_UNKNOWN', group: 'other', gloss: '종류를 알 수 없는 페이지' },
  { code: 14, name: 'FIL_PAGE_COMPRESSED', group: 'other', gloss: '페이지 압축된 페이지' },
  { code: 15, name: 'FIL_PAGE_ENCRYPTED', group: 'other', gloss: '암호화된 페이지' },
  { code: 16, name: 'FIL_PAGE_COMPRESSED_AND_ENCRYPTED', group: 'other', gloss: '압축 후 암호화된 페이지' },
  { code: 17, name: 'FIL_PAGE_ENCRYPTED_RTREE', group: 'other', gloss: '암호화된 R-tree 페이지' },
  { code: 18, name: 'FIL_PAGE_SDI_BLOB', group: 'sdi', gloss: 'SDI 오버플로 페이지' },
  { code: 19, name: 'FIL_PAGE_SDI_ZBLOB', group: 'sdi', gloss: '압축 테이블의 SDI 오버플로 페이지' },
  { code: 20, name: 'FIL_PAGE_TYPE_LEGACY_DBLWR', group: 'other', gloss: '예전 doublewrite 버퍼' },
  { code: 21, name: 'FIL_PAGE_TYPE_RSEG_ARRAY', group: 'other', gloss: '롤백 세그먼트 배열' },
  { code: 22, name: 'FIL_PAGE_TYPE_LOB_INDEX', group: 'lob', gloss: 'LOB 인덱스 엔트리를 더 담는 페이지' },
  { code: 23, name: 'FIL_PAGE_TYPE_LOB_DATA', group: 'lob', gloss: 'LOB 값의 조각' },
  { code: 24, name: 'FIL_PAGE_TYPE_LOB_FIRST', group: 'lob', gloss: 'LOB 첫 페이지' },
  { code: 25, name: 'FIL_PAGE_TYPE_ZLOB_FIRST', group: 'lob', gloss: '압축 LOB 첫 페이지' },
  { code: 26, name: 'FIL_PAGE_TYPE_ZLOB_DATA', group: 'lob', gloss: '압축 LOB 조각' },
  { code: 27, name: 'FIL_PAGE_TYPE_ZLOB_INDEX', group: 'lob', gloss: '압축 LOB 인덱스 엔트리' },
  { code: 28, name: 'FIL_PAGE_TYPE_ZLOB_FRAG', group: 'lob', gloss: '압축 LOB 작은 조각' },
  { code: 29, name: 'FIL_PAGE_TYPE_ZLOB_FRAG_ENTRY', group: 'lob', gloss: '압축 LOB 작은 조각 목록' },
  { code: 17853, name: 'FIL_PAGE_SDI', group: 'sdi', gloss: '테이블 정의(SDI)를 담은 B+tree 페이지' },
  { code: 17854, name: 'FIL_PAGE_RTREE', group: 'index', gloss: '공간 인덱스(R-tree) 페이지' },
  { code: 17855, name: 'FIL_PAGE_INDEX', group: 'index', gloss: 'B+tree 인덱스 페이지' },
];

const BY_CODE = new Map(TYPES.map((type) => [type.code, type]));

export const FIL_PAGE_INDEX = 17855;
export const FIL_PAGE_SDI = 17853;
export const FIL_PAGE_RTREE = 17854;
export const FIL_PAGE_INODE = 3;
export const FIL_PAGE_TYPE_FSP_HDR = 8;
export const FIL_PAGE_TYPE_XDES = 9;

export function pageType(code: number): PageTypeInfo {
  return BY_CODE.get(code) ?? { code, name: `알 수 없는 타입 ${code}`, group: 'other', gloss: '이 도구가 모르는 페이지 타입' };
}

/** Pages laid out as a B+tree page: page header, infimum/supremum, records, directory. */
export function isIndexLike(code: number): boolean {
  return code === FIL_PAGE_INDEX || code === FIL_PAGE_SDI || code === FIL_PAGE_RTREE;
}

/** The identifier without its FIL_PAGE_ / FIL_PAGE_TYPE_ prefix, for tight labels: INDEX, LOB_FIRST. */
export function shortName(code: number): string {
  return pageType(code).name.replace(/^FIL_PAGE_(TYPE_)?/, '');
}

import type { PageId, TreeSnapshot } from '../../engine/btree/types';
import type { IndexSnapshot } from '../../engine/executor/events';
import { formatKey, type ClusteredRecord, type SecondaryRecord } from '../../engine/schema/record';

export interface PageCell {
  key: string;
  /** Main label: the key for internal pages, the key for leaves too. */
  primary: string;
  /** Second line on a leaf: the payload the page actually stores. */
  secondary?: string;
  deleteMark?: boolean;
  childId?: PageId;
}

export interface PageBox {
  id: PageId;
  kind: 'leaf' | 'internal';
  level: number;
  parentId: PageId | null;
  childIds: PageId[];
  cells: PageCell[];
  nextLeafId: PageId | null;
  prevLeafId: PageId | null;
}

function isClusteredRecord(value: unknown): value is ClusteredRecord {
  return typeof value === 'object' && value !== null && 'row' in value;
}

function isSecondaryRecord(value: unknown): value is SecondaryRecord {
  return typeof value === 'object' && value !== null && 'primaryKey' in value;
}

function describeValue(value: unknown): { text: string; deleteMark: boolean } {
  if (isClusteredRecord(value)) {
    const columns = Object.entries(value.row)
      .map(([column, v]) => `${column}=${v === null ? 'NULL' : String(v)}`)
      .join(' ');
    return { text: columns, deleteMark: value.deleteMark };
  }
  if (isSecondaryRecord(value)) {
    return { text: `PK(${formatKey(value.primaryKey)})`, deleteMark: value.deleteMark };
  }
  return { text: String(value), deleteMark: false };
}

export function toPageBoxes(snapshot: TreeSnapshot<unknown>): PageBox[] {
  return snapshot.pages.map((page) => {
    if (page.kind === 'internal') {
      return {
        id: page.id,
        kind: 'internal' as const,
        level: page.level,
        parentId: page.parentId,
        childIds: page.entries.map((entry) => entry.childId),
        nextLeafId: null,
        prevLeafId: null,
        cells: page.entries.map((entry) => ({
          key: formatKey(entry.key),
          primary: formatKey(entry.key),
          secondary: `▸ p${entry.childId}`,
          childId: entry.childId,
        })),
      };
    }

    return {
      id: page.id,
      kind: 'leaf' as const,
      level: 0,
      parentId: page.parentId,
      childIds: [],
      nextLeafId: page.nextLeafId,
      prevLeafId: page.prevLeafId,
      cells: page.entries.map((entry) => {
        const described = describeValue(entry.value);
        return {
          key: formatKey(entry.key),
          primary: formatKey(entry.key),
          secondary: described.text,
          deleteMark: described.deleteMark,
        };
      }),
    };
  });
}

export function indexTitle(index: IndexSnapshot): string {
  return index.kind === 'clustered'
    ? `클러스터드 인덱스 (PRIMARY: ${index.columns.join(', ')})`
    : `세컨더리 인덱스 ${index.indexId} (${index.columns.join(', ')})`;
}

export function indexHint(index: IndexSnapshot): string {
  return index.kind === 'clustered'
    ? '리프 페이지가 행 전체를 담는다. 클러스터드 인덱스가 곧 테이블이다.'
    : '리프 엔트리는 PK 만 담는다. 인덱스에 없는 컬럼을 읽으려면 클러스터드 인덱스를 한 번 더 타야 한다.';
}

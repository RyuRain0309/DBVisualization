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
    ? `PRIMARY (${index.columns.join(', ')})`
    : `${index.indexId} (${index.columns.join(', ')})`;
}

export interface TreeStats {
  pages: number;
  /** Number of levels from root to leaf; 0 when the index is empty. */
  height: number;
  leafEntries: number;
}

export function treeStats(snapshot: TreeSnapshot<unknown>): TreeStats {
  const leaves = snapshot.pages.filter((page) => page.kind === 'leaf');
  return {
    pages: snapshot.pages.length,
    height: snapshot.pages.length === 0 ? 0 : Math.max(...snapshot.pages.map((p) => p.level)) + 1,
    leafEntries: leaves.reduce((sum, page) => sum + page.entries.length, 0),
  };
}

export function indexHint(index: IndexSnapshot): string {
  return index.kind === 'clustered'
    ? '리프 페이지에 행 전체가 들어간다. 클러스터드 인덱스가 곧 테이블이라 이 트리 밖에 따로 데이터가 없다.'
    : '리프에는 인덱스 컬럼 뒤에 PK 를 붙인 키만 들어간다. 인덱스에 없는 컬럼이 필요하면 그 PK 로 클러스터드 인덱스를 한 번 더 타야 한다 (bookmark lookup).';
}

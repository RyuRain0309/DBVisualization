import type { ClusteredRecord, KeyValue, Row } from '../schema/record';
import { primaryKeyColumns, type TableDef } from '../schema/table';
import { BTree, type MutationResult, type PageIdAllocator, type SearchResult } from './btree';

export const CLUSTERED_INDEX_ID = 'PRIMARY';

/**
 * The clustered index *is* the table: its leaf pages hold the full rows, so there is no
 * separate heap to look them up in.
 */
export class ClusteredIndex {
  readonly tree: BTree<ClusteredRecord>;
  private readonly table: TableDef;

  constructor(table: TableDef, capacity: number, allocator: PageIdAllocator) {
    this.table = table;
    this.tree = new BTree<ClusteredRecord>({
      indexId: CLUSTERED_INDEX_ID,
      capacity,
      allocator,
    });
  }

  get columns(): string[] {
    return primaryKeyColumns(this.table);
  }

  keyOf(row: Row): KeyValue {
    return this.columns.map((column) => row[column] ?? null);
  }

  insert(record: ClusteredRecord): MutationResult {
    return this.tree.insert(this.keyOf(record.row), record);
  }

  /** Replaces the stored version of a row; the key must be unchanged. */
  update(key: KeyValue, record: ClusteredRecord): MutationResult {
    return this.tree.update(key, record);
  }

  remove(key: KeyValue): MutationResult {
    return this.tree.remove(key);
  }

  find(key: KeyValue): SearchResult<ClusteredRecord> {
    return this.tree.search(key);
  }

  /** Every record in key order, delete-marked ones included; visibility is decided elsewhere. */
  records(): { key: KeyValue; record: ClusteredRecord }[] {
    return this.tree.entries().map(({ key, value }) => ({ key, record: value }));
  }
}

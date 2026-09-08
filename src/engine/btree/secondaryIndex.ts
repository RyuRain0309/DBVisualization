import type { KeyValue, Row, SecondaryRecord } from '../schema/record';
import { primaryKeyColumns, type IndexDef, type TableDef } from '../schema/table';
import { BTree, type MutationResult, type PageIdAllocator, type SearchResult } from './btree';

/**
 * A secondary index leaf entry stores the primary key, not a row pointer, so reading columns
 * that are not in the index costs a second descent through the clustered index (bookmark lookup).
 *
 * InnoDB also appends the primary key to the index key itself, which is why even a non-unique
 * index has unique entries and why the PK is available without touching the clustered index.
 */
export class SecondaryIndex {
  readonly def: IndexDef;
  readonly tree: BTree<SecondaryRecord>;
  private readonly pkColumns: string[];

  constructor(table: TableDef, def: IndexDef, capacity: number, allocator: PageIdAllocator) {
    this.def = def;
    this.pkColumns = primaryKeyColumns(table);
    this.tree = new BTree<SecondaryRecord>({ indexId: def.name, capacity, allocator });
  }

  get name(): string {
    return this.def.name;
  }

  /** Indexed columns first, then the primary key appended by InnoDB. */
  keyOf(row: Row): KeyValue {
    return [
      ...this.def.columns.map((column) => row[column] ?? null),
      ...this.pkColumns.map((column) => row[column] ?? null),
    ];
  }

  /** The user-visible part of the key, i.e. what the index is actually declared on. */
  indexedPartOf(key: KeyValue): KeyValue {
    return key.slice(0, this.def.columns.length);
  }

  primaryKeyPartOf(key: KeyValue): KeyValue {
    return key.slice(this.def.columns.length);
  }

  insert(row: Row, primaryKey: KeyValue): MutationResult {
    return this.tree.insert(this.keyOf(row), { primaryKey, deleteMark: false });
  }

  remove(row: Row): MutationResult {
    return this.tree.remove(this.keyOf(row));
  }

  find(row: Row): SearchResult<SecondaryRecord> {
    return this.tree.search(this.keyOf(row));
  }

  /** True when a statement changed any column this index is built on. */
  isAffectedBy(changedColumns: string[]): boolean {
    return this.def.columns.some((column) =>
      changedColumns.some((changed) => changed.toLowerCase() === column.toLowerCase()),
    );
  }

  entries(): { key: KeyValue; record: SecondaryRecord }[] {
    return this.tree.entries().map(({ key, value }) => ({ key, record: value }));
  }
}

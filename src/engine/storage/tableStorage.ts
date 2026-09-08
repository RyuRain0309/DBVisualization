import { ClusteredIndex } from '../btree/clusteredIndex';
import { SecondaryIndex } from '../btree/secondaryIndex';
import type { BTreeMutation, PageId } from '../btree/types';
import type { PageIdAllocator } from '../btree/btree';
import { compareKeys, type ClusteredRecord, type KeyValue, type Row } from '../schema/record';
import { HIDDEN_ROW_ID, type TableDef } from '../schema/table';

export interface IndexOperation {
  indexId: string;
  /** Root-to-leaf pages the operation had to read. */
  path: PageId[];
  mutations: BTreeMutation[];
}

export interface RowVersion {
  trxId: number;
  rollPtr: number | null;
}

/**
 * One table's physical storage: the clustered index plus every secondary index.
 * A single DML statement usually touches several of these trees, which is what makes
 * "one SQL statement = one B+tree change" a common misconception worth showing.
 */
export class TableStorage {
  readonly table: TableDef;
  readonly clustered: ClusteredIndex;
  readonly secondaries: SecondaryIndex[];
  private nextRowId = 1;

  constructor(table: TableDef, capacity: number, allocator: PageIdAllocator) {
    this.table = table;
    this.clustered = new ClusteredIndex(table, capacity, allocator);
    this.secondaries = table.secondaryIndexes.map(
      (def) => new SecondaryIndex(table, def, capacity, allocator),
    );
  }

  /** Fills in NULLs for unspecified columns and the hidden row id when the table has no PK. */
  materializeRow(input: Row): Row {
    const row: Row = {};
    for (const column of this.table.columns) {
      row[column.name] = input[column.name] ?? null;
    }
    if (this.table.primaryKey.kind === 'hidden-row-id') {
      row[HIDDEN_ROW_ID] = this.nextRowId++;
    }
    return row;
  }

  primaryKeyOf(row: Row): KeyValue {
    return this.clustered.keyOf(row);
  }

  findRecord(primaryKey: KeyValue): ClusteredRecord | null {
    return this.clustered.find(primaryKey).value;
  }

  insertRow(row: Row, version: RowVersion): IndexOperation[] {
    const record: ClusteredRecord = {
      row,
      trxId: version.trxId,
      rollPtr: version.rollPtr,
      deleteMark: false,
    };
    const primaryKey = this.primaryKeyOf(row);
    const operations: IndexOperation[] = [this.toOperation('PRIMARY', this.clustered.insert(record))];

    for (const index of this.secondaries) {
      operations.push(this.toOperation(index.name, index.insert(row, primaryKey)));
    }
    return operations;
  }

  /**
   * InnoDB can update a row in place in the clustered index, but a secondary index entry is
   * never updated: the old entry is delete-marked and a new one inserted, because the index
   * key itself moves.
   */
  updateRow(
    primaryKey: KeyValue,
    newRow: Row,
    changedColumns: string[],
    version: RowVersion,
  ): IndexOperation[] {
    const existing = this.clustered.find(primaryKey);
    if (!existing.found || existing.value === null) {
      throw new Error('Row to update no longer exists');
    }
    const oldRow = existing.value.row;
    const newPrimaryKey = this.primaryKeyOf(newRow);
    const primaryKeyChanged = compareKeys(newPrimaryKey, primaryKey) !== 0;

    const record: ClusteredRecord = {
      row: newRow,
      trxId: version.trxId,
      rollPtr: version.rollPtr,
      deleteMark: false,
    };

    const operations: IndexOperation[] = [];
    if (primaryKeyChanged) {
      // Changing the primary key means moving the row inside the clustered index,
      // which InnoDB implements as delete + insert rather than an in-place update.
      operations.push(this.toOperation('PRIMARY', this.clustered.remove(primaryKey)));
      operations.push(this.toOperation('PRIMARY', this.clustered.insert(record)));
    } else {
      operations.push(this.toOperation('PRIMARY', this.clustered.update(primaryKey, record)));
    }

    for (const index of this.secondaries) {
      if (!primaryKeyChanged && !index.isAffectedBy(changedColumns)) continue;
      operations.push(this.toOperation(index.name, index.remove(oldRow)));
      operations.push(this.toOperation(index.name, index.insert(newRow, newPrimaryKey)));
    }
    return operations;
  }

  /**
   * DELETE only sets the delete-mark; the record stays in the page (and keeps holding its
   * position in the index) until purge removes it once no read view needs it any more.
   */
  markDeleted(primaryKey: KeyValue, version: RowVersion): IndexOperation[] {
    const existing = this.clustered.find(primaryKey);
    if (!existing.found || existing.value === null) {
      throw new Error('Row to delete no longer exists');
    }
    const record: ClusteredRecord = {
      ...existing.value,
      trxId: version.trxId,
      rollPtr: version.rollPtr,
      deleteMark: true,
    };
    return [this.toOperation('PRIMARY', this.clustered.update(primaryKey, record))];
  }

  /** Clears a delete-mark, which is how a rolled back DELETE brings the row back. */
  restoreDeleted(primaryKey: KeyValue, version: RowVersion): IndexOperation[] {
    const existing = this.clustered.find(primaryKey);
    if (!existing.found || existing.value === null) {
      throw new Error('Row to restore no longer exists');
    }
    const record: ClusteredRecord = {
      ...existing.value,
      trxId: version.trxId,
      rollPtr: version.rollPtr,
      deleteMark: false,
    };
    return [this.toOperation('PRIMARY', this.clustered.update(primaryKey, record))];
  }

  /** Physically removes a delete-marked record from every index. */
  purgeRow(primaryKey: KeyValue): IndexOperation[] {
    const existing = this.clustered.find(primaryKey);
    if (!existing.found || existing.value === null) return [];
    const row = existing.value.row;

    const operations: IndexOperation[] = [];
    for (const index of this.secondaries) {
      operations.push(this.toOperation(index.name, index.remove(row)));
    }
    operations.push(this.toOperation('PRIMARY', this.clustered.remove(primaryKey)));
    return operations;
  }

  /** Every stored record in primary key order, delete-marked ones included. */
  scan(): { key: KeyValue; record: ClusteredRecord }[] {
    return this.clustered.records();
  }

  private toOperation(
    indexId: string,
    result: { path: PageId[]; mutations: BTreeMutation[] },
  ): IndexOperation {
    return { indexId, path: result.path, mutations: result.mutations };
  }
}

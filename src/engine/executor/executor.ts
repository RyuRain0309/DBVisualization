import type { BTreeMutation } from '../btree/types';
import type { RedoLog } from '../logs/redoLog';
import type { UndoLog, UndoLogRecord } from '../logs/undoLog';
import { compareKeys, formatKey, type ClusteredRecord, type KeyValue, type Row } from '../schema/record';
import { HIDDEN_ROW_ID, findColumn, valueMatchesType, type TableDef } from '../schema/table';
import type { Catalog } from '../schema/catalog';
import type {
  DeleteStatement,
  InsertStatement,
  SelectStatement,
  Statement,
  UpdateStatement,
  WhereClause,
} from '../sql/ast';
import type { ParsedStatement } from '../sql/parser';
import type { IsolationLevel } from '../transaction/isolationLevel';
import type { Transaction } from '../transaction/transaction';
import type { TableStorage, IndexOperation } from '../storage/tableStorage';
import { describeMutation, describeRow } from './describe';
import type { StepEvent } from './events';
import { chooseAccessPath, matchesWhere, type AccessPath } from './predicate';

export class ExecutionError extends Error {}

export interface ExecutionContext {
  readonly catalog: Catalog;
  readonly redoLog: RedoLog;
  readonly undoLog: UndoLog;
  isolationLevel: IsolationLevel;
  transaction: Transaction | null;
  storageOf(tableName: string): TableStorage;
  createStorage(table: TableDef): TableStorage;
  beginTransaction(implicit: boolean): Transaction;
  finishTransaction(state: 'committed' | 'rolled-back'): void;
  emit(event: StepEvent): void;
}

interface MatchedRow {
  key: KeyValue;
  record: ClusteredRecord;
}

export function executeStatement(ctx: ExecutionContext, parsed: ParsedStatement): void {
  const { statement, text } = parsed;
  ctx.emit({
    type: 'statement-start',
    sql: text,
    statement,
    explanation: `${text} 파싱 완료.`,
  });

  switch (statement.kind) {
    case 'create-table':
      executeCreateTable(ctx, statement);
      return;
    case 'begin':
      executeBegin(ctx);
      return;
    case 'commit':
      executeCommit(ctx);
      return;
    case 'rollback':
      executeRollback(ctx);
      return;
    case 'set-isolation':
      executeSetIsolation(ctx, statement.level);
      return;
    case 'insert':
      runInTransaction(ctx, text, (tx) => executeInsert(ctx, tx, statement));
      return;
    case 'update':
      runInTransaction(ctx, text, (tx) => executeUpdate(ctx, tx, statement));
      return;
    case 'delete':
      runInTransaction(ctx, text, (tx) => executeDelete(ctx, tx, statement));
      return;
    case 'select':
      runInTransaction(ctx, text, (tx) => executeSelect(ctx, tx, statement));
      return;
  }
}

/**
 * MySQL wraps a bare statement in its own transaction when autocommit is on. Showing that
 * implicit transaction is worth the noise: it is why locks taken by a statement outside
 * BEGIN disappear the moment the statement ends.
 */
function runInTransaction(
  ctx: ExecutionContext,
  sql: string,
  run: (tx: Transaction) => number,
): void {
  const existing = ctx.transaction;
  const tx = existing ?? beginImplicit(ctx);
  const affectedRows = run(tx);

  ctx.emit({
    type: 'statement-end',
    sql,
    affectedRows,
    explanation: `문장 실행 완료 (영향받은 행 ${affectedRows}개).`,
  });

  if (!existing) commitTransaction(ctx, tx);
}

function beginImplicit(ctx: ExecutionContext): Transaction {
  const tx = ctx.beginTransaction(true);
  ctx.emit({
    type: 'transaction-begin',
    txId: tx.id,
    implicit: true,
    explanation: `BEGIN 없이 실행돼 autocommit 이 트랜잭션 ${tx.id} 을 자동으로 시작했다. 문장이 끝나면 바로 커밋된다.`,
  });
  return tx;
}

function executeBegin(ctx: ExecutionContext): void {
  if (ctx.transaction?.isActive) {
    throw new ExecutionError('A transaction is already active');
  }
  const tx = ctx.beginTransaction(false);
  ctx.emit({
    type: 'transaction-begin',
    txId: tx.id,
    implicit: false,
    explanation: `트랜잭션 ${tx.id} 시작 (격리수준 ${tx.isolationLevel}). 이제 잡은 락은 COMMIT/ROLLBACK 까지 유지된다.`,
  });
}

function executeCommit(ctx: ExecutionContext): void {
  const tx = ctx.transaction;
  if (!tx?.isActive) throw new ExecutionError('No transaction is active');
  commitTransaction(ctx, tx);
}

function commitTransaction(ctx: ExecutionContext, tx: Transaction): void {
  const upToLsn = ctx.redoLog.flush();
  ctx.emit({
    type: 'redo-flush',
    upToLsn,
    explanation: `커밋 전에 redo 로그를 LSN ${upToLsn} 까지 디스크로 내린다. 데이터 페이지는 아직 메모리에 있어도 이 시점부터 복구가 보장된다 (WAL).`,
  });

  const undoRecords = ctx.undoLog.recordsOf(tx.id);
  if (undoRecords.length > 0) {
    for (const record of undoRecords) ctx.undoLog.setState(record.undoNo, 'retained');
    ctx.emit({
      type: 'undo-retain',
      records: undoRecords,
      explanation: `undo 레코드 ${undoRecords.length}건은 커밋 후에도 바로 지우지 않는다. 다른 트랜잭션의 read view 가 이전 버전을 필요로 할 수 있어 purge 가 정리할 때까지 남는다.`,
    });
  }

  ctx.finishTransaction('committed');
  ctx.emit({
    type: 'transaction-commit',
    txId: tx.id,
    implicit: tx.implicit,
    explanation: `트랜잭션 ${tx.id} 커밋 완료.`,
  });

  purgeCommitted(ctx);
}

function executeRollback(ctx: ExecutionContext): void {
  const tx = ctx.transaction;
  if (!tx?.isActive) throw new ExecutionError('No transaction is active');

  // Undo records are applied newest first, so a row touched several times walks back
  // through its own version chain in order.
  for (const record of ctx.undoLog.recordsOf(tx.id)) {
    applyUndoRecord(ctx, tx, record);
  }
  ctx.undoLog.discard(tx.id);

  ctx.finishTransaction('rolled-back');
  ctx.emit({
    type: 'transaction-rollback',
    txId: tx.id,
    explanation: `트랜잭션 ${tx.id} 롤백 완료. undo 레코드는 역할을 다해 폐기됐다.`,
  });
}

function applyUndoRecord(ctx: ExecutionContext, tx: Transaction, record: UndoLogRecord): void {
  const storage = ctx.storageOf(record.tableName);
  const version = { trxId: record.beforeTrxId ?? 0, rollPtr: record.rollPtr };

  ctx.emit({
    type: 'undo-apply',
    record,
    explanation: undoApplyExplanation(record),
  });

  let operations: IndexOperation[];
  switch (record.kind) {
    case 'INSERT_UNDO':
      operations = storage.purgeRow(record.primaryKey);
      break;
    case 'UPDATE_UNDO':
      operations = storage.updateRow(
        record.primaryKey,
        record.beforeImage!,
        Object.keys(record.beforeImage!),
        version,
      );
      break;
    case 'DELETE_UNDO':
      operations = storage.restoreDeleted(record.primaryKey, version);
      break;
  }

  applyOperations(ctx, tx, operations);
}

function undoApplyExplanation(record: UndoLogRecord): string {
  const key = formatKey(record.primaryKey);
  switch (record.kind) {
    case 'INSERT_UNDO':
      return `INSERT_UNDO 적용: 이 트랜잭션이 넣은 PK (${key}) 행을 인덱스에서 제거한다.`;
    case 'UPDATE_UNDO':
      return `UPDATE_UNDO 적용: PK (${key}) 행을 이전 이미지(${describeRow(record.beforeImage!)})로 되돌린다.`;
    case 'DELETE_UNDO':
      return `DELETE_UNDO 적용: PK (${key}) 행의 delete-mark 를 해제해 되살린다.`;
  }
}

/**
 * Purge is the background job that removes delete-marked records and frees undo records.
 * Here it runs right after commit, which is only safe because a single session means no
 * other read view can still need the old versions.
 */
function purgeCommitted(ctx: ExecutionContext): void {
  const purgeable = ctx.undoLog
    .all()
    .filter((record) => record.state === 'retained' && record.kind === 'DELETE_UNDO');

  for (const record of purgeable) {
    const storage = ctx.storageOf(record.tableName);
    const existing = storage.findRecord(record.primaryKey);
    if (!existing?.deleteMark) continue;

    ctx.emit({
      type: 'purge',
      primaryKey: record.primaryKey,
      tableName: record.tableName,
      explanation: `purge: 커밋된 DELETE 의 delete-mark 레코드 PK (${formatKey(record.primaryKey)}) 를 이제 아무 read view 도 보지 않으므로 인덱스에서 실제로 제거한다.`,
    });
    applyOperations(ctx, null, storage.purgeRow(record.primaryKey));
  }

  for (const record of ctx.undoLog.all()) {
    if (record.state === 'retained') ctx.undoLog.setState(record.undoNo, 'purged');
  }
}

function executeSetIsolation(ctx: ExecutionContext, level: IsolationLevel): void {
  if (ctx.transaction?.isActive) {
    throw new ExecutionError(
      'Cannot change isolation level inside an active transaction (MySQL applies it from the next transaction)',
    );
  }
  ctx.isolationLevel = level;
  ctx.emit({
    type: 'isolation-change',
    level,
    explanation: `격리수준을 ${level} 로 변경했다. 다음 트랜잭션부터 적용된다.`,
  });
}

function executeCreateTable(ctx: ExecutionContext, statement: Statement & { kind: 'create-table' }): void {
  const table: TableDef = {
    name: statement.table,
    columns: statement.columns,
    primaryKey: statement.primaryKey
      ? { kind: 'declared', columns: statement.primaryKey }
      : { kind: 'hidden-row-id' },
    secondaryIndexes: statement.indexes,
  };

  for (const index of table.secondaryIndexes) {
    for (const column of index.columns) {
      if (!findColumn(table, column)) {
        throw new ExecutionError(`Key column '${column}' doesn't exist in table`);
      }
    }
  }

  ctx.catalog.createTable(table);
  ctx.createStorage(table);

  ctx.emit({
    type: 'table-created',
    table,
    explanation:
      table.primaryKey.kind === 'declared'
        ? `테이블 ${table.name} 생성. PRIMARY KEY(${table.primaryKey.columns.join(', ')}) 로 클러스터드 인덱스가 만들어지고, 세컨더리 인덱스 ${table.secondaryIndexes.length}개가 별도 B+tree 로 생성된다.`
        : `테이블 ${table.name} 생성. PRIMARY KEY 를 지정하지 않아 InnoDB 가 숨은 ${HIDDEN_ROW_ID} 컬럼을 만들어 그 위에 클러스터드 인덱스를 구성한다.`,
  });
}

function executeInsert(
  ctx: ExecutionContext,
  tx: Transaction,
  statement: InsertStatement,
): number {
  const storage = ctx.storageOf(statement.table);
  const table = storage.table;
  const targetColumns =
    statement.columns ?? table.columns.map((column) => column.name);

  for (const values of statement.rows) {
    if (values.length !== targetColumns.length) {
      throw new ExecutionError(
        `Column count doesn't match value count (expected ${targetColumns.length})`,
      );
    }

    const input: Row = {};
    targetColumns.forEach((column, i) => {
      const definition = findColumn(table, column);
      if (!definition) throw new ExecutionError(`Unknown column '${column}' in field list`);
      const value = values[i]!;
      if (!valueMatchesType(value, definition.type)) {
        throw new ExecutionError(`Incorrect value for column '${column}'`);
      }
      if (value === null && definition.notNull) {
        throw new ExecutionError(`Column '${column}' cannot be null`);
      }
      input[definition.name] = value;
    });

    const row = storage.materializeRow(input);
    const primaryKey = storage.primaryKeyOf(row);
    if (storage.findRecord(primaryKey)) {
      throw new ExecutionError(`Duplicate entry '${formatKey(primaryKey)}' for key 'PRIMARY'`);
    }

    // The undo record is written before the page is modified, so a crash in between still
    // leaves a way back.
    const undo = appendUndo(ctx, tx, {
      tableName: table.name,
      kind: 'INSERT_UNDO',
      primaryKey,
      beforeImage: null,
      beforeTrxId: null,
      rollPtr: null,
    });

    emitTraverse(
      ctx,
      'PRIMARY',
      storage.clustered.find(primaryKey).path,
      primaryKey,
      `클러스터드 인덱스에서 PK (${formatKey(primaryKey)}) 가 들어갈 리프 페이지를 루트부터 찾아 내려간다.`,
      '삽입 위치 탐색',
    );

    applyOperations(ctx, tx, storage.insertRow(row, { trxId: tx.id, rollPtr: undo.undoNo }));
  }

  return statement.rows.length;
}

function executeUpdate(
  ctx: ExecutionContext,
  tx: Transaction,
  statement: UpdateStatement,
): number {
  const storage = ctx.storageOf(statement.table);
  const table = storage.table;
  const matched = findRows(ctx, storage, statement.where);

  for (const { key, record } of matched) {
    const newRow: Row = { ...record.row };
    const changedColumns: string[] = [];
    for (const assignment of statement.assignments) {
      const definition = findColumn(table, assignment.column);
      if (!definition) throw new ExecutionError(`Unknown column '${assignment.column}' in field list`);
      if (!valueMatchesType(assignment.value, definition.type)) {
        throw new ExecutionError(`Incorrect value for column '${assignment.column}'`);
      }
      if (assignment.value === null && definition.notNull) {
        throw new ExecutionError(`Column '${assignment.column}' cannot be null`);
      }
      newRow[definition.name] = assignment.value;
      changedColumns.push(definition.name);
    }

    const undo = appendUndo(ctx, tx, {
      tableName: table.name,
      kind: 'UPDATE_UNDO',
      primaryKey: key,
      beforeImage: { ...record.row },
      beforeTrxId: record.trxId,
      rollPtr: record.rollPtr,
    });

    const affectedIndexes = storage.secondaries.filter((index) => index.isAffectedBy(changedColumns));
    if (affectedIndexes.length > 0) {
      ctx.emit({
        type: 'note',
        explanation: `변경된 컬럼(${changedColumns.join(', ')}) 때문에 세컨더리 인덱스 ${affectedIndexes
          .map((index) => index.name)
          .join(', ')} 도 함께 갱신해야 한다. 세컨더리 엔트리는 제자리 수정이 아니라 삭제 후 삽입이다.`,
      });
    }

    applyOperations(
      ctx,
      tx,
      storage.updateRow(key, newRow, changedColumns, { trxId: tx.id, rollPtr: undo.undoNo }),
    );
  }

  return matched.length;
}

function executeDelete(
  ctx: ExecutionContext,
  tx: Transaction,
  statement: DeleteStatement,
): number {
  const storage = ctx.storageOf(statement.table);
  const matched = findRows(ctx, storage, statement.where);

  for (const { key, record } of matched) {
    const undo = appendUndo(ctx, tx, {
      tableName: storage.table.name,
      kind: 'DELETE_UNDO',
      primaryKey: key,
      beforeImage: { ...record.row },
      beforeTrxId: record.trxId,
      rollPtr: record.rollPtr,
    });

    ctx.emit({
      type: 'note',
      explanation: `DELETE 는 레코드를 즉시 지우지 않고 delete-mark 만 남긴다. 이전 버전을 읽어야 하는 read view 가 있을 수 있기 때문이며, 실제 제거는 purge 가 한다.`,
    });

    applyOperations(ctx, tx, storage.markDeleted(key, { trxId: tx.id, rollPtr: undo.undoNo }));
  }

  return matched.length;
}

function executeSelect(
  ctx: ExecutionContext,
  _tx: Transaction,
  statement: SelectStatement,
): number {
  const storage = ctx.storageOf(statement.table);
  const matched = findRows(ctx, storage, statement.where);
  const rows = matched.map(({ record }) =>
    statement.columns === '*'
      ? { ...record.row }
      : Object.fromEntries(statement.columns.map((column) => [column, record.row[column] ?? null])),
  );

  ctx.emit({
    type: 'rows-returned',
    rows,
    explanation: `${rows.length}개 행 반환.`,
  });
  return rows.length;
}

function findRows(
  ctx: ExecutionContext,
  storage: TableStorage,
  where: WhereClause | null,
): MatchedRow[] {
  const access = chooseAccessPath(storage.table, where);

  if (access.kind === 'pk-point' && access.key) {
    const result = storage.clustered.find(access.key);
    emitTraverse(
      ctx,
      'PRIMARY',
      result.path,
      access.key,
      `${access.description}. 루트에서 리프까지 ${result.path.length}개 페이지만 읽으면 된다.`,
      access.description,
    );
    if (!result.found || !result.value || result.value.deleteMark) return [];
    return matchesWhere(result.value.row, where)
      ? [{ key: access.key, record: result.value }]
      : [];
  }

  emitScanTraverse(ctx, storage, access);

  return storage
    .scan()
    .filter(({ record }) => !record.deleteMark && matchesWhere(record.row, where))
    .map(({ key, record }) => ({ key, record }));
}

function emitScanTraverse(
  ctx: ExecutionContext,
  storage: TableStorage,
  access: AccessPath,
): void {
  const rootId = storage.clustered.tree.root;
  ctx.emit({
    type: 'index-traverse',
    indexId: access.indexId,
    path: rootId === null ? [] : [rootId],
    key: null,
    access: access.description,
    explanation:
      access.kind === 'full-scan'
        ? `${access.description}. 리프 페이지 연결 리스트를 따라 모든 레코드를 훑는다.`
        : `${access.description}.`,
  });
}

function emitTraverse(
  ctx: ExecutionContext,
  indexId: string,
  path: number[],
  key: KeyValue | null,
  explanation: string,
  access: string,
): void {
  ctx.emit({ type: 'index-traverse', indexId, path, key, access, explanation });
}

function appendUndo(
  ctx: ExecutionContext,
  tx: Transaction,
  record: Omit<UndoLogRecord, 'undoNo' | 'state' | 'txId'>,
): UndoLogRecord {
  const stored = ctx.undoLog.append({ ...record, txId: tx.id });
  tx.undoNos.push(stored.undoNo);
  ctx.emit({
    type: 'undo-append',
    record: stored,
    explanation: undoAppendExplanation(stored),
  });
  return stored;
}

function undoAppendExplanation(record: UndoLogRecord): string {
  const key = formatKey(record.primaryKey);
  switch (record.kind) {
    case 'INSERT_UNDO':
      return `undo 레코드 #${record.undoNo}(INSERT_UNDO) 기록. 되돌릴 이전 버전이 없으므로 롤백 시 이 행을 지우면 된다.`;
    case 'UPDATE_UNDO':
      return `undo 레코드 #${record.undoNo}(UPDATE_UNDO) 기록. PK (${key}) 의 이전 이미지를 담고 있어 롤백에도 쓰이고, MVCC 가 옛 버전을 읽을 때도 이 레코드를 따라간다.`;
    case 'DELETE_UNDO':
      return `undo 레코드 #${record.undoNo}(DELETE_UNDO) 기록. PK (${key}) 의 전체 이미지를 보관해 롤백 시 되살릴 수 있게 한다.`;
  }
}

function applyOperations(
  ctx: ExecutionContext,
  tx: Transaction | null,
  operations: IndexOperation[],
): void {
  for (const operation of operations) {
    for (const mutation of operation.mutations) {
      emitMutation(ctx, tx, mutation);
    }
  }
}

function emitMutation(
  ctx: ExecutionContext,
  tx: Transaction | null,
  mutation: BTreeMutation,
): void {
  const description = describeMutation(mutation);
  ctx.emit({
    type: 'btree-mutation',
    indexId: mutation.indexId,
    mutation,
    explanation: `[${mutation.indexId}] ${description}`,
  });

  const redo = ctx.redoLog.append(tx?.id ?? 0, mutation, `[${mutation.indexId}] ${description}`);
  ctx.emit({
    type: 'redo-append',
    record: redo,
    explanation: `redo 레코드 LSN ${redo.lsn} (${redo.kind}) 를 로그 버퍼에 추가. 아직 디스크에 내려가지 않은 상태다.`,
  });
}

export function rowKeyMatches(a: KeyValue, b: KeyValue): boolean {
  return compareKeys(a, b) === 0;
}

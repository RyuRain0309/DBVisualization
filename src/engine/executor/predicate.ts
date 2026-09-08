import { compareValues, type KeyValue, type Row } from '../schema/record';
import { primaryKeyColumns, type TableDef } from '../schema/table';
import type { Condition, WhereClause } from '../sql/ast';

export function matchesCondition(row: Row, condition: Condition): boolean {
  const value = row[condition.column] ?? null;
  // NULL never matches a comparison, exactly like SQL three-valued logic.
  if (value === null || condition.value === null) return false;
  const cmp = compareValues(value, condition.value);
  switch (condition.operator) {
    case '=':
      return cmp === 0;
    case '<>':
      return cmp !== 0;
    case '<':
      return cmp < 0;
    case '<=':
      return cmp <= 0;
    case '>':
      return cmp > 0;
    case '>=':
      return cmp >= 0;
  }
}

export function matchesWhere(row: Row, where: WhereClause | null): boolean {
  if (!where) return true;
  return where.conditions.every((condition) => matchesCondition(row, condition));
}

export type AccessPathKind = 'pk-point' | 'pk-range' | 'secondary' | 'full-scan';

export interface AccessPath {
  kind: AccessPathKind;
  indexId: string;
  /** Set only for a unique point lookup on the primary key. */
  key: KeyValue | null;
  /** Conditions the chosen index can evaluate itself. */
  indexConditions: Condition[];
  description: string;
}

function conditionsOn(where: WhereClause | null, column: string): Condition[] {
  if (!where) return [];
  return where.conditions.filter((c) => c.column.toLowerCase() === column.toLowerCase());
}

/**
 * Picking the access path is not just an optimizer detail here: a unique point lookup, a range
 * scan and a full scan lock very different amounts of the index, so this decision is what the
 * lock visualisation is built on.
 */
export function chooseAccessPath(table: TableDef, where: WhereClause | null): AccessPath {
  const pkColumns = primaryKeyColumns(table);
  const firstPk = pkColumns[0]!;
  const pkConditions = conditionsOn(where, firstPk);

  const equality = pkConditions.find((c) => c.operator === '=');
  if (equality && pkColumns.length === 1) {
    return {
      kind: 'pk-point',
      indexId: 'PRIMARY',
      key: [equality.value],
      indexConditions: pkConditions,
      description: `클러스터드 인덱스 ${firstPk} = ${String(equality.value)} 단일 조회`,
    };
  }

  if (pkConditions.length > 0) {
    return {
      kind: 'pk-range',
      indexId: 'PRIMARY',
      key: null,
      indexConditions: pkConditions,
      description: `클러스터드 인덱스 ${firstPk} 범위 스캔`,
    };
  }

  for (const index of table.secondaryIndexes) {
    const first = index.columns[0]!;
    const indexConditions = conditionsOn(where, first);
    if (indexConditions.length > 0) {
      return {
        kind: 'secondary',
        indexId: index.name,
        key: null,
        indexConditions,
        description: `세컨더리 인덱스 ${index.name}(${first}) 스캔 후 PK 로 클러스터드 인덱스 재조회`,
      };
    }
  }

  return {
    kind: 'full-scan',
    indexId: 'PRIMARY',
    key: null,
    indexConditions: [],
    description: '쓸 수 있는 인덱스가 없어 클러스터드 인덱스 전체 스캔',
  };
}

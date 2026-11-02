import { useState } from 'react';
import type { EngineSnapshot, TableSnapshot } from '../../engine/executor/events';
import { describeColumnType, primaryKeyColumns } from '../../engine/schema/table';
import { BTreeCanvas } from './BTreeCanvas';
import type { Highlight } from './highlight';

type IndexFilter = 'all' | 'clustered' | 'secondary' | string;

interface Props {
  snapshot: EngineSnapshot;
  highlight: Highlight;
}

export function TreeExplorer({ snapshot, highlight }: Props) {
  const [tableName, setTableName] = useState<string | null>(null);
  const [filter, setFilter] = useState<IndexFilter>('all');

  if (snapshot.tables.length === 0) {
    return (
      <p className="placeholder">
        먼저 CREATE TABLE 로 테이블을 만들면 클러스터드 인덱스와 세컨더리 인덱스 B+tree 가 여기에
        그려진다.
      </p>
    );
  }

  // The selection is kept loose on purpose: resetting the database drops tables, and falling
  // back to the first one keeps the view usable instead of going blank.
  const table =
    snapshot.tables.find((entry) => entry.table.name === tableName) ?? snapshot.tables[0]!;

  const indexes = table.indexes.filter((index) => {
    if (filter === 'all') return true;
    if (filter === 'clustered') return index.kind === 'clustered';
    if (filter === 'secondary') return index.kind === 'secondary';
    return index.indexId === filter;
  });

  const secondaryCount = table.indexes.filter((index) => index.kind === 'secondary').length;

  return (
    <div className="explorer">
      {snapshot.tables.length > 1 && (
        <div className="explorer__row">
          <span className="explorer__label">테이블</span>
          {snapshot.tables.map((entry) => (
            <button
              key={entry.table.name}
              type="button"
              className={`chip ${entry.table.name === table.table.name ? 'chip--active' : ''}`}
              onClick={() => {
                setTableName(entry.table.name);
                setFilter('all');
              }}
            >
              {entry.table.name}
              <span className="chip__count">{entry.indexes.length} 인덱스</span>
            </button>
          ))}
        </div>
      )}

      <TableSummary table={table} />

      <div className="explorer__row">
        <span className="explorer__label">인덱스</span>
        <button
          type="button"
          className={`chip ${filter === 'all' ? 'chip--active' : ''}`}
          onClick={() => setFilter('all')}
        >
          전체
        </button>
        <button
          type="button"
          className={`chip chip--clustered ${filter === 'clustered' ? 'chip--active' : ''}`}
          onClick={() => setFilter('clustered')}
        >
          클러스터드
        </button>
        {secondaryCount > 0 && (
          <button
            type="button"
            className={`chip chip--secondary ${filter === 'secondary' ? 'chip--active' : ''}`}
            onClick={() => setFilter('secondary')}
          >
            세컨더리 {secondaryCount}개
          </button>
        )}
        {table.indexes
          .filter((index) => index.kind === 'secondary')
          .map((index) => (
            <button
              key={index.indexId}
              type="button"
              className={`chip chip--secondary ${filter === index.indexId ? 'chip--active' : ''}`}
              onClick={() => setFilter(index.indexId)}
            >
              {index.indexId}
            </button>
          ))}
      </div>

      <div className="explorer__trees">
        {indexes.map((index) => (
          <BTreeCanvas
            key={index.indexId}
            index={index}
            highlight={highlight}
            locks={snapshot.locks}
          />
        ))}
      </div>

      {filter === 'all' && secondaryCount > 0 && (
        <p className="explorer__note">
          두 트리는 같은 행을 다르게 담고 있다. 세컨더리 인덱스로 찾은 결과는 PK 뿐이라, 나머지 컬럼이
          필요하면 그 PK 로 위쪽 클러스터드 인덱스를 다시 타고 내려가야 한다.
        </p>
      )}
    </div>
  );
}

function TableSummary({ table }: { table: TableSnapshot }) {
  const pk = primaryKeyColumns(table.table);

  return (
    <div className="table-summary">
      <h2>{table.table.name}</h2>
      <div className="table-summary__columns">
        {table.table.columns.map((column) => (
          <span
            key={column.name}
            className={`table-summary__column ${
              pk.includes(column.name) ? 'table-summary__column--pk' : ''
            }`}
          >
            {column.name}
            <em>{describeColumnType(column.type)}</em>
            {column.notNull && <span className="table-summary__flag">NOT NULL</span>}
          </span>
        ))}
      </div>
      <p className="table-summary__keys">
        PRIMARY KEY ({pk.join(', ')})
        {table.table.primaryKey.kind === 'hidden-row-id' && ' — 선언한 PK 가 없어 InnoDB 가 Hidden Column 으로 만든 것'}
        {table.table.secondaryIndexes.length > 0 &&
          ` · ${table.table.secondaryIndexes
            .map((index) => `KEY ${index.name} (${index.columns.join(', ')})`)
            .join(' · ')}`}
      </p>
    </div>
  );
}

import type { SqlValue } from '../schema/record';
import type { ColumnDef, ColumnType, IndexDef } from '../schema/table';
import type { IsolationLevel } from '../transaction/isolationLevel';
import type {
  Assignment,
  ComparisonOperator,
  Condition,
  SelectLockMode,
  Statement,
  WhereClause,
} from './ast';
import { SqlSyntaxError, tokenize, type Token } from './tokenizer';

export class UnsupportedSqlError extends SqlSyntaxError {}

export interface ParsedStatement {
  statement: Statement;
  text: string;
}

const COMPARISON_OPERATORS = new Set(['=', '<', '<=', '>', '>=', '<>', '!=']);

interface ParsedColumnDef extends ColumnDef {
  inlinePrimaryKey: boolean;
  inlineUnique: boolean;
}

class Parser {
  private pos = 0;
  private readonly tokens: Token[];
  private readonly source: string;

  constructor(tokens: Token[], source: string) {
    this.tokens = tokens;
    this.source = source;
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]!;
  }

  private next(): Token {
    const token = this.peek();
    if (token.kind !== 'eof') this.pos += 1;
    return token;
  }

  private at(value: string): boolean {
    const token = this.peek();
    return (token.kind === 'keyword' || token.kind === 'punct') && token.value === value;
  }

  private accept(value: string): boolean {
    if (!this.at(value)) return false;
    this.pos += 1;
    return true;
  }

  private expect(value: string): Token {
    if (!this.at(value)) {
      const token = this.peek();
      throw new SqlSyntaxError(
        `Expected '${value}' but found '${token.value || 'end of input'}'`,
        token.start,
      );
    }
    return this.next();
  }

  private expectIdent(what: string): string {
    const token = this.next();
    if (token.kind !== 'ident') {
      throw new SqlSyntaxError(`Expected ${what} but found '${token.value || 'end of input'}'`, token.start);
    }
    return token.value;
  }

  private unsupported(feature: string, hint: string): never {
    const token = this.peek();
    throw new UnsupportedSqlError(`Unsupported in this simplified engine: ${feature} (${hint})`, token.start);
  }

  atEnd(): boolean {
    return this.peek().kind === 'eof';
  }

  parseScript(): ParsedStatement[] {
    const statements: ParsedStatement[] = [];
    while (!this.atEnd()) {
      while (this.accept(';')) {
        if (this.atEnd()) break;
      }
      if (this.atEnd()) break;
      const start = this.peek().start;
      const statement = this.parseStatement();
      const end = this.tokens[this.pos - 1]!.end;
      this.accept(';');
      statements.push({ statement, text: this.source.slice(start, end).trim() });
    }
    return statements;
  }

  private parseStatement(): Statement {
    const token = this.peek();
    if (token.kind !== 'keyword') {
      throw new SqlSyntaxError(`Unexpected '${token.value || 'end of input'}'`, token.start);
    }
    switch (token.value) {
      case 'CREATE':
        return this.parseCreateTable();
      case 'INSERT':
        return this.parseInsert();
      case 'UPDATE':
        return this.parseUpdate();
      case 'DELETE':
        return this.parseDelete();
      case 'SELECT':
        return this.parseSelect();
      case 'BEGIN':
        this.next();
        return { kind: 'begin' };
      case 'START':
        this.next();
        this.expect('TRANSACTION');
        return { kind: 'begin' };
      case 'COMMIT':
        this.next();
        return { kind: 'commit' };
      case 'ROLLBACK':
        this.next();
        return { kind: 'rollback' };
      case 'SET':
        return this.parseSetIsolation();
      default:
        throw new SqlSyntaxError(`Unsupported statement '${token.value}'`, token.start);
    }
  }

  private parseCreateTable(): Statement {
    this.expect('CREATE');
    this.expect('TABLE');
    const table = this.expectIdent('table name');
    this.expect('(');

    const columns: ParsedColumnDef[] = [];
    const indexes: IndexDef[] = [];
    let primaryKey: string[] | null = null;

    do {
      if (this.at('PRIMARY')) {
        this.next();
        this.expect('KEY');
        primaryKey = this.parseColumnList();
        continue;
      }
      if (this.at('UNIQUE') || this.at('KEY') || this.at('INDEX')) {
        const unique = this.accept('UNIQUE');
        if (unique && !this.at('KEY') && !this.at('INDEX')) {
          // `UNIQUE (col)` without KEY/INDEX
          const cols = this.parseColumnList();
          indexes.push({ name: `uniq_${cols.join('_')}`, columns: cols, unique: true });
          continue;
        }
        this.next(); // KEY | INDEX
        const name = this.peek().kind === 'ident' ? this.expectIdent('index name') : null;
        const cols = this.parseColumnList();
        indexes.push({ name: name ?? `idx_${cols.join('_')}`, columns: cols, unique });
        continue;
      }
      columns.push(this.parseColumnDef());
      const last = columns[columns.length - 1]!;
      if (last.inlinePrimaryKey) {
        primaryKey = [last.name];
      }
      if (last.inlineUnique) {
        indexes.push({ name: `uniq_${last.name}`, columns: [last.name], unique: true });
      }
    } while (this.accept(','));

    this.expect(')');

    return {
      kind: 'create-table',
      table,
      columns: columns.map(({ name, type, notNull }) => ({ name, type, notNull })),
      primaryKey,
      indexes,
    };
  }

  private parseColumnDef(): ParsedColumnDef {
    const name = this.expectIdent('column name');
    const type = this.parseColumnType();
    let notNull = false;
    let inlinePrimaryKey = false;
    let inlineUnique = false;

    for (;;) {
      if (this.at('NOT')) {
        this.next();
        this.expect('NULL');
        notNull = true;
        continue;
      }
      if (this.at('NULL')) {
        this.next();
        continue;
      }
      if (this.at('PRIMARY')) {
        this.next();
        this.expect('KEY');
        inlinePrimaryKey = true;
        notNull = true;
        continue;
      }
      if (this.at('UNIQUE')) {
        this.next();
        this.accept('KEY');
        inlineUnique = true;
        continue;
      }
      break;
    }

    return { name, type, notNull, inlinePrimaryKey, inlineUnique };
  }

  private parseColumnType(): ColumnType {
    const token = this.next();
    if (token.value === 'INT' || token.value === 'INTEGER') {
      if (this.accept('(')) {
        this.next();
        this.expect(')');
      }
      return { kind: 'INT' };
    }
    if (token.value === 'VARCHAR') {
      this.expect('(');
      const lengthToken = this.next();
      if (lengthToken.kind !== 'number') {
        throw new SqlSyntaxError('VARCHAR needs a length', lengthToken.start);
      }
      this.expect(')');
      return { kind: 'VARCHAR', length: Number(lengthToken.value) };
    }
    throw new UnsupportedSqlError(
      `Unsupported column type '${token.value}' (이 시뮬레이터는 INT 와 VARCHAR 만 지원합니다)`,
      token.start,
    );
  }

  private parseColumnList(): string[] {
    this.expect('(');
    const columns: string[] = [];
    do {
      columns.push(this.expectIdent('column name'));
    } while (this.accept(','));
    this.expect(')');
    return columns;
  }

  private parseInsert(): Statement {
    this.expect('INSERT');
    this.expect('INTO');
    const table = this.expectIdent('table name');
    const columns = this.at('(') ? this.parseColumnList() : null;
    this.expect('VALUES');

    const rows: SqlValue[][] = [];
    do {
      this.expect('(');
      const values: SqlValue[] = [];
      do {
        values.push(this.parseLiteral());
      } while (this.accept(','));
      this.expect(')');
      rows.push(values);
    } while (this.accept(','));

    return { kind: 'insert', table, columns, rows };
  }

  private parseUpdate(): Statement {
    this.expect('UPDATE');
    const table = this.expectIdent('table name');
    this.expect('SET');
    const assignments: Assignment[] = [];
    do {
      const column = this.expectIdent('column name');
      this.expect('=');
      assignments.push({ column, value: this.parseLiteral() });
    } while (this.accept(','));
    const where = this.parseOptionalWhere();
    return { kind: 'update', table, assignments, where };
  }

  private parseDelete(): Statement {
    this.expect('DELETE');
    this.expect('FROM');
    const table = this.expectIdent('table name');
    const where = this.parseOptionalWhere();
    return { kind: 'delete', table, where };
  }

  private parseSelect(): Statement {
    this.expect('SELECT');
    let columns: '*' | string[];
    if (this.accept('*')) {
      columns = '*';
    } else {
      const names: string[] = [];
      do {
        names.push(this.expectIdent('column name'));
      } while (this.accept(','));
      columns = names;
    }
    this.expect('FROM');
    const table = this.expectIdent('table name');
    if (this.at('JOIN')) {
      this.unsupported('JOIN', '단일 테이블 조회만 지원합니다');
    }
    const where = this.parseOptionalWhere();
    if (this.at('ORDER') || this.at('GROUP')) {
      this.unsupported(this.peek().value + ' BY', '정렬/집계는 인덱스 구조 시각화 범위 밖입니다');
    }
    const lockMode = this.parseLockMode();
    return { kind: 'select', table, columns, where, lockMode };
  }

  private parseLockMode(): SelectLockMode {
    if (this.accept('FOR')) {
      this.expect('UPDATE');
      return 'exclusive';
    }
    if (this.accept('LOCK')) {
      this.expect('IN');
      this.expect('SHARE');
      this.expect('MODE');
      return 'share';
    }
    return 'none';
  }

  private parseOptionalWhere(): WhereClause | null {
    if (!this.accept('WHERE')) return null;
    const conditions: Condition[] = [];
    do {
      conditions.push(this.parseCondition());
    } while (this.accept('AND'));
    if (this.at('OR')) {
      this.unsupported('OR', 'AND 로 연결된 단일 컬럼 비교만 지원합니다');
    }
    return { conditions };
  }

  private parseCondition(): Condition {
    const column = this.expectIdent('column name');
    const opToken = this.next();
    if (opToken.value === 'IN' || opToken.value === 'LIKE') {
      this.unsupported(opToken.value, '= < <= > >= <> 비교만 지원합니다');
    }
    if (opToken.kind !== 'punct' || !COMPARISON_OPERATORS.has(opToken.value)) {
      throw new SqlSyntaxError(`Expected a comparison operator but found '${opToken.value}'`, opToken.start);
    }
    const operator = (opToken.value === '!=' ? '<>' : opToken.value) as ComparisonOperator;
    return { column, operator, value: this.parseLiteral() };
  }

  private parseLiteral(): SqlValue {
    const token = this.next();
    if (token.kind === 'number') return Number(token.value);
    if (token.kind === 'string') return token.value;
    if (token.kind === 'keyword' && token.value === 'NULL') return null;
    throw new SqlSyntaxError(`Expected a literal value but found '${token.value || 'end of input'}'`, token.start);
  }

  private parseSetIsolation(): Statement {
    this.expect('SET');
    // MySQL allows SET [GLOBAL | SESSION] TRANSACTION ISOLATION LEVEL ...
    if (this.peek().kind === 'ident') {
      const scope = this.peek().value.toUpperCase();
      if (scope === 'SESSION' || scope === 'GLOBAL') this.next();
    }
    this.expect('TRANSACTION');
    this.expect('ISOLATION');
    this.expect('LEVEL');
    const level = this.parseIsolationLevel();
    return { kind: 'set-isolation', level };
  }

  private parseIsolationLevel(): IsolationLevel {
    if (this.accept('SERIALIZABLE')) return 'SERIALIZABLE';
    if (this.accept('REPEATABLE')) {
      this.expect('READ');
      return 'REPEATABLE READ';
    }
    this.expect('READ');
    if (this.accept('COMMITTED')) return 'READ COMMITTED';
    this.expect('UNCOMMITTED');
    return 'READ UNCOMMITTED';
  }
}

export function parse(sql: string): ParsedStatement[] {
  return new Parser(tokenize(sql), sql).parseScript();
}

export { SqlSyntaxError };

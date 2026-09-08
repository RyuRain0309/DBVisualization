export type TokenKind = 'keyword' | 'ident' | 'number' | 'string' | 'punct' | 'eof';

export interface Token {
  kind: TokenKind;
  /** Original text. Keywords are upper-cased so callers can compare directly. */
  value: string;
  start: number;
  end: number;
}

export class SqlSyntaxError extends Error {
  readonly position: number;

  constructor(message: string, position: number) {
    super(message);
    this.position = position;
  }
}

const KEYWORDS = new Set([
  'CREATE',
  'TABLE',
  'PRIMARY',
  'KEY',
  'UNIQUE',
  'INDEX',
  'NOT',
  'NULL',
  'INT',
  'INTEGER',
  'VARCHAR',
  'INSERT',
  'INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE',
  'FROM',
  'SELECT',
  'WHERE',
  'AND',
  'OR',
  'BEGIN',
  'START',
  'TRANSACTION',
  'COMMIT',
  'ROLLBACK',
  'ISOLATION',
  'LEVEL',
  'READ',
  'UNCOMMITTED',
  'COMMITTED',
  'REPEATABLE',
  'SERIALIZABLE',
  'IN',
  'LIKE',
  'JOIN',
  'ORDER',
  'GROUP',
  'BY',
  'SHARE',
  'MODE',
  'FOR',
  'LOCK',
]);

const PUNCT = ['<=', '>=', '<>', '!=', '(', ')', ',', ';', '=', '<', '>', '*', '.'];

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i]!;

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }

    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) throw new SqlSyntaxError('Unterminated comment', i);
      i = end + 2;
      continue;
    }

    if (ch === "'" || ch === '"') {
      const quote = ch;
      const start = i;
      i += 1;
      let value = '';
      while (i < sql.length && sql[i] !== quote) {
        if (sql[i] === '\\' && i + 1 < sql.length) {
          value += sql[i + 1];
          i += 2;
          continue;
        }
        value += sql[i];
        i += 1;
      }
      if (i >= sql.length) throw new SqlSyntaxError('Unterminated string literal', start);
      i += 1;
      tokens.push({ kind: 'string', value, start, end: i });
      continue;
    }

    if (ch === '`') {
      const start = i;
      i += 1;
      let value = '';
      while (i < sql.length && sql[i] !== '`') {
        value += sql[i];
        i += 1;
      }
      if (i >= sql.length) throw new SqlSyntaxError('Unterminated quoted identifier', start);
      i += 1;
      tokens.push({ kind: 'ident', value, start, end: i });
      continue;
    }

    if (isDigit(ch) || (ch === '-' && isDigit(sql[i + 1] ?? ''))) {
      const start = i;
      if (ch === '-') i += 1;
      while (i < sql.length && isDigit(sql[i]!)) i += 1;
      if (sql[i] === '.' && isDigit(sql[i + 1] ?? '')) {
        i += 1;
        while (i < sql.length && isDigit(sql[i]!)) i += 1;
      }
      tokens.push({ kind: 'number', value: sql.slice(start, i), start, end: i });
      continue;
    }

    if (isIdentStart(ch)) {
      const start = i;
      while (i < sql.length && isIdentPart(sql[i]!)) i += 1;
      const raw = sql.slice(start, i);
      const upper = raw.toUpperCase();
      tokens.push({
        kind: KEYWORDS.has(upper) ? 'keyword' : 'ident',
        value: KEYWORDS.has(upper) ? upper : raw,
        start,
        end: i,
      });
      continue;
    }

    const punct = PUNCT.find((p) => sql.startsWith(p, i));
    if (punct) {
      tokens.push({ kind: 'punct', value: punct, start: i, end: i + punct.length });
      i += punct.length;
      continue;
    }

    throw new SqlSyntaxError(`Unexpected character '${ch}'`, i);
  }

  tokens.push({ kind: 'eof', value: '', start: sql.length, end: sql.length });
  return tokens;
}

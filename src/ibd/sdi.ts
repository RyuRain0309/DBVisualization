import { u32, u64, u8 } from './bytes';
import { parseIndexHeader, walkRecords } from './indexPage';

/**
 * One SDI record. The SDI B+tree's columns are: type (4), id (8), DB_TRX_ID (6), DB_ROLL_PTR (7),
 * uncompressed length (4), compressed length (4), then the zlib-compressed JSON.
 */
export interface SdiEntry {
  /** 1 = table, 2 = tablespace. */
  type: number;
  id: bigint;
  uncompressedLength: number;
  compressedLength: number;
  /** The JSON went to an SDI_BLOB page; only its 20-byte reference is in the record. */
  external: boolean;
  data: Uint8Array;
}

/** Records on one SDI leaf page. The only variable-length column is the data, so one length field. */
export function readSdiEntries(page: Uint8Array): SdiEntry[] {
  const { records } = walkRecords(page, parseIndexHeader(page));
  const entries: SdiEntry[] = [];
  for (const record of records) {
    if (record.status !== 'ordinary' || record.deleted) continue;
    const o = record.origin;
    // The length sits right before the 5-byte header (there is no NULL bitmap: no column is nullable).
    const first = u8(page, o - 6);
    const twoBytes = (first & 0x80) !== 0;
    const length = twoBytes ? ((first & 0x3f) << 8) | u8(page, o - 7) : first;
    const external = twoBytes && (first & 0x40) !== 0;
    entries.push({
      type: u32(page, o),
      id: u64(page, o + 4),
      uncompressedLength: u32(page, o + 25),
      compressedLength: u32(page, o + 29),
      external,
      data: page.slice(o + 33, o + 33 + length),
    });
  }
  return entries;
}

export async function inflate(data: Uint8Array): Promise<Uint8Array> {
  // 'deflate' in the Compression Streams API is the zlib format, which is what InnoDB writes.
  const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface SdiColumn {
  name: string;
  /** dd::enum_column_types code. */
  type: number;
  /** As SHOW CREATE TABLE writes it, e.g. varchar(20). Empty for InnoDB's hidden columns. */
  columnType: string;
  nullable: boolean;
  /** Not a user column: DB_TRX_ID, DB_ROLL_PTR, DB_ROW_ID. */
  hidden: boolean;
  ordinal: number;
  /** Maximum length in bytes. */
  charLength: number;
}

export interface SdiIndex {
  name: string;
  type: 'PRIMARY' | 'UNIQUE' | 'MULTIPLE' | 'FULLTEXT' | 'SPATIAL' | 'UNKNOWN';
  /** se_private_data id= : the PAGE_INDEX_ID its pages carry. */
  id: string | null;
  /** se_private_data root= : its root page number. */
  root: number | null;
  /** Columns the user declared, in key order. */
  columns: string[];
}

export interface SdiTable {
  schema: string | null;
  name: string;
  rowFormat: string;
  /** mysqld_version_id of the server that last wrote the definition, e.g. 80046. */
  mysqlVersion: number;
  columns: SdiColumn[];
  indexes: SdiIndex[];
}

const ROW_FORMATS: Record<number, string> = {
  1: 'FIXED',
  2: 'DYNAMIC',
  3: 'COMPRESSED',
  4: 'REDUNDANT',
  5: 'COMPACT',
  6: 'PAGED',
};

const INDEX_TYPES: Record<number, SdiIndex['type']> = {
  1: 'PRIMARY',
  2: 'UNIQUE',
  3: 'MULTIPLE',
  4: 'FULLTEXT',
  5: 'SPATIAL',
};

/** "id=158;root=4;space_id=2;" → { id: '158', root: '4', space_id: '2' } */
function privateData(text: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof text !== 'string') return out;
  for (const pair of text.split(';')) {
    const at = pair.indexOf('=');
    if (at > 0) out[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return out;
}

interface RawColumn {
  name: string;
  type: number;
  column_type_utf8: string;
  is_nullable: boolean;
  hidden: number;
  ordinal_position: number;
  char_length: number;
}

interface RawIndex {
  name: string;
  type: number;
  se_private_data: string;
  elements: { column_opx: number; hidden: boolean }[];
}

interface RawTable {
  name: string;
  schema_ref?: string;
  row_format: number;
  columns: RawColumn[];
  indexes: RawIndex[];
}

export function toSdiTable(json: { mysqld_version_id: number; dd_object: RawTable }): SdiTable {
  const raw = json.dd_object;
  const columns: SdiColumn[] = raw.columns.map((column) => ({
    name: column.name,
    type: column.type,
    columnType: column.column_type_utf8,
    nullable: column.is_nullable,
    // dd::Column::enum_hidden_type: 1 = visible; 2 = hidden by InnoDB (DB_TRX_ID and friends).
    hidden: column.hidden !== 1,
    ordinal: column.ordinal_position,
    charLength: column.char_length,
  }));
  const indexes: SdiIndex[] = raw.indexes.map((index) => {
    const data = privateData(index.se_private_data);
    return {
      name: index.name,
      type: INDEX_TYPES[index.type] ?? 'UNKNOWN',
      id: data.id ?? null,
      root: data.root === undefined ? null : Number(data.root),
      columns: index.elements
        .filter((element) => !element.hidden)
        .map((element) => columns[element.column_opx]?.name ?? `#${element.column_opx}`),
    };
  });
  return {
    schema: typeof raw.schema_ref === 'string' ? raw.schema_ref : null,
    name: raw.name,
    rowFormat: ROW_FORMATS[raw.row_format] ?? String(raw.row_format),
    mysqlVersion: json.mysqld_version_id,
    columns,
    indexes,
  };
}

export interface SdiResult {
  table: SdiTable | null;
  /** Problems met on the way, shown to the reader rather than thrown. */
  errors: string[];
}

export async function decodeSdi(entries: SdiEntry[]): Promise<SdiResult> {
  const errors: string[] = [];
  let table: SdiTable | null = null;
  for (const entry of entries) {
    if (entry.type !== 1) continue;
    if (entry.external) {
      errors.push('테이블 정의가 길어 SDI_BLOB 페이지로 나가 있다. 아직 이 경우는 읽지 않는다.');
      continue;
    }
    try {
      const text = new TextDecoder().decode(await inflate(entry.data));
      table = toSdiTable(JSON.parse(text));
    } catch (error) {
      errors.push(`테이블 정의를 풀지 못했다: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!table && errors.length === 0) errors.push('SDI 에 테이블 정의가 없다.');
  return { table, errors };
}

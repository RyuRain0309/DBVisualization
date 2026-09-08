import type { TableDef } from './table';

export class SchemaError extends Error {}

export class Catalog {
  private tables = new Map<string, TableDef>();

  createTable(table: TableDef): void {
    const key = table.name.toLowerCase();
    if (this.tables.has(key)) {
      throw new SchemaError(`Table '${table.name}' already exists`);
    }
    this.tables.set(key, table);
  }

  getTable(name: string): TableDef {
    const table = this.tables.get(name.toLowerCase());
    if (!table) {
      throw new SchemaError(`Table '${name}' doesn't exist`);
    }
    return table;
  }

  hasTable(name: string): boolean {
    return this.tables.has(name.toLowerCase());
  }

  listTables(): TableDef[] {
    return [...this.tables.values()];
  }
}

import type { PageId } from '../btree/types';

export interface DoublewriteBatch {
  id: number;
  pages: { pageId: PageId; indexId: string; tableName: string }[];
  lsn: number;
}

/**
 * The doublewrite buffer. Before a data page is written to its tablespace, InnoDB writes it
 * here first, so a torn page (a write interrupted halfway) can be recovered from the copy.
 * Redo alone cannot fix a torn page, because redo describes changes to a page that is assumed
 * to be intact.
 */
export class DoublewriteBuffer {
  private batches: DoublewriteBatch[] = [];
  private nextId = 1;

  write(pages: DoublewriteBatch['pages'], lsn: number): DoublewriteBatch {
    const batch: DoublewriteBatch = { id: this.nextId++, pages, lsn };
    this.batches.push(batch);
    return batch;
  }

  state(): DoublewriteBatch[] {
    return this.batches.map((batch) => ({ ...batch, pages: [...batch.pages] }));
  }

  get pagesWritten(): number {
    return this.batches.reduce((sum, batch) => sum + batch.pages.length, 0);
  }
}

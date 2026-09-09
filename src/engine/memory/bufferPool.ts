import type { PageId } from '../btree/types';

export interface BufferFrame {
  pageId: PageId;
  indexId: string;
  tableName: string;
  /** Changed in memory but not written back to the tablespace file yet. */
  dirty: boolean;
  /** LSN of the last change to this page. Its redo must be durable before the page is written. */
  lastLsn: number;
  /**
   * InnoDB splits the LRU list in two: newly read pages land in the old sublist, and only a
   * second access promotes them to the young one. That is what keeps a full scan from
   * evicting the hot pages.
   */
  sublist: 'young' | 'old';
  reads: number;
}

export interface BufferPoolState {
  capacity: number;
  /** Most recently used first. */
  frames: BufferFrame[];
  dirtyCount: number;
  reads: number;
  hits: number;
  evictions: number;
}

export interface TouchResult {
  frame: BufferFrame;
  loadedFromDisk: boolean;
  evicted: BufferFrame | null;
  promoted: boolean;
}

export const DEFAULT_BUFFER_POOL_PAGES = 8;

/**
 * A miniature buffer pool. Real InnoDB caches 16KB pages in a pool sized in gigabytes; here the
 * capacity is a handful of pages so eviction is something you can actually watch happen.
 */
export class BufferPool {
  readonly capacity: number;
  /** Most recently used first. */
  private frames: BufferFrame[] = [];
  private reads = 0;
  private hits = 0;
  private evictions = 0;

  constructor(capacity: number = DEFAULT_BUFFER_POOL_PAGES) {
    this.capacity = capacity;
  }

  /** Records a page access, loading it into the pool when it is not cached yet. */
  touch(pageId: PageId, indexId: string, tableName: string): TouchResult {
    this.reads += 1;
    const index = this.frames.findIndex(
      (frame) => frame.pageId === pageId && frame.indexId === indexId,
    );

    if (index >= 0) {
      const [frame] = this.frames.splice(index, 1);
      const hit = frame!;
      hit.reads += 1;
      const promoted = hit.sublist === 'old';
      hit.sublist = 'young';
      this.frames.unshift(hit);
      this.hits += 1;
      return { frame: hit, loadedFromDisk: false, evicted: null, promoted };
    }

    const evicted = this.frames.length >= this.capacity ? this.evictOldest() : null;
    const frame: BufferFrame = {
      pageId,
      indexId,
      tableName,
      dirty: false,
      lastLsn: 0,
      sublist: 'old',
      reads: 1,
    };
    // Midpoint insertion: a freshly read page starts in the old sublist, not at the head.
    const midpoint = Math.floor(this.frames.length * 0.63);
    this.frames.splice(midpoint, 0, frame);
    return { frame, loadedFromDisk: true, evicted, promoted: false };
  }

  markDirty(pageId: PageId, indexId: string, tableName: string, lsn: number): BufferFrame {
    const result = this.touch(pageId, indexId, tableName);
    result.frame.dirty = true;
    result.frame.lastLsn = Math.max(result.frame.lastLsn, lsn);
    return result.frame;
  }

  /** Pages the pool no longer tracks, e.g. after a page was freed by a merge. */
  forget(pageId: PageId, indexId: string): void {
    this.frames = this.frames.filter(
      (frame) => !(frame.pageId === pageId && frame.indexId === indexId),
    );
  }

  dirtyFrames(): BufferFrame[] {
    return this.frames.filter((frame) => frame.dirty);
  }

  /** Marks flushed pages clean. The caller is responsible for the doublewrite step. */
  markFlushed(frames: BufferFrame[]): void {
    for (const flushed of frames) {
      const frame = this.frames.find(
        (entry) => entry.pageId === flushed.pageId && entry.indexId === flushed.indexId,
      );
      if (frame) frame.dirty = false;
    }
  }

  state(): BufferPoolState {
    return {
      capacity: this.capacity,
      frames: this.frames.map((frame) => ({ ...frame })),
      dirtyCount: this.frames.filter((frame) => frame.dirty).length,
      reads: this.reads,
      hits: this.hits,
      evictions: this.evictions,
    };
  }

  private evictOldest(): BufferFrame | null {
    // The tail of the list is the coldest page; a dirty one has to be written before it goes.
    const victim = this.frames.pop() ?? null;
    if (victim) this.evictions += 1;
    return victim;
  }
}

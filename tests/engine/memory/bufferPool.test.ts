import { describe, expect, it } from 'vitest';
import type { StepEvent } from '../../../src/engine/executor/events';
import { BufferPool } from '../../../src/engine/memory/bufferPool';
import { Database } from '../../../src/engine/transaction/database';
import type { Session } from '../../../src/engine/transaction/session';

function run(session: Session, sql: string): StepEvent[] {
  const result = session.run(sql);
  if (result.error) throw new Error(result.error);
  return result.steps.map((step) => step.event);
}

describe('BufferPool', () => {
  it('counts a second access to the same page as a hit', () => {
    const pool = new BufferPool(4);
    expect(pool.touch(1, 'PRIMARY', 't').loadedFromDisk).toBe(true);
    expect(pool.touch(1, 'PRIMARY', 't').loadedFromDisk).toBe(false);
    expect(pool.state().hits).toBe(1);
  });

  it('puts a newly read page in the old sublist and promotes it on the next read', () => {
    const pool = new BufferPool(4);
    expect(pool.touch(1, 'PRIMARY', 't').frame.sublist).toBe('old');

    const second = pool.touch(1, 'PRIMARY', 't');
    expect(second.promoted).toBe(true);
    expect(second.frame.sublist).toBe('young');
  });

  it('evicts the coldest page once the pool is full', () => {
    const pool = new BufferPool(2);
    pool.touch(1, 'PRIMARY', 't');
    pool.touch(2, 'PRIMARY', 't');
    const third = pool.touch(3, 'PRIMARY', 't');

    expect(third.evicted).not.toBeNull();
    expect(pool.state().frames).toHaveLength(2);
    expect(pool.state().evictions).toBe(1);
  });

  it('keeps a modified page dirty until it is flushed', () => {
    const pool = new BufferPool(4);
    pool.markDirty(1, 'PRIMARY', 't', 12);
    expect(pool.dirtyFrames()).toHaveLength(1);
    expect(pool.state().dirtyCount).toBe(1);

    pool.markFlushed(pool.dirtyFrames());
    expect(pool.dirtyFrames()).toEqual([]);
  });

  it('forgets a page that was freed', () => {
    const pool = new BufferPool(4);
    pool.markDirty(1, 'PRIMARY', 't', 3);
    pool.forget(1, 'PRIMARY');
    expect(pool.state().frames).toEqual([]);
  });
});

describe('buffer pool inside the engine', () => {
  function setup() {
    const db = new Database(4, 6);
    const session = db.openSession();
    run(session, 'CREATE TABLE t (id INT NOT NULL, v INT, PRIMARY KEY (id))');
    return { db, session };
  }

  it('leaves modified pages dirty after COMMIT, because commit only flushes the log', () => {
    const { db, session } = setup();
    run(session, 'INSERT INTO t VALUES (1, 100)');

    expect(db.bufferPool.state().dirtyCount).toBeGreaterThan(0);
    expect(db.redoLog.state().flushedUpToLsn).toBeGreaterThan(0);
  });

  it('writes dirty pages through the doublewrite buffer at a checkpoint', () => {
    const { db, session } = setup();
    run(session, 'INSERT INTO t VALUES (1, 100), (2, 200)');

    const events = session.checkpoint().steps.map((step) => step.event);
    const flush = events.find((event) => event.type === 'page-flush');

    expect(flush).toBeDefined();
    expect(db.doublewrite.pagesWritten).toBeGreaterThan(0);
    expect(db.bufferPool.state().dirtyCount).toBe(0);
    expect(db.checkpointLsn).toBeGreaterThan(0);
  });

  it('reports a checkpoint with nothing to do', () => {
    const { session } = setup();
    session.checkpoint();
    const events = session.checkpoint().steps.map((step) => step.event);

    expect(events.find((event) => event.type === 'checkpoint')).toMatchObject({ flushedPages: 0 });
  });

  it('loads pages into the pool while traversing an index', () => {
    const { db, session } = setup();
    run(session, 'INSERT INTO t VALUES (1, 100), (2, 200), (3, 300), (4, 400), (5, 500)');
    run(session, 'SELECT * FROM t WHERE id = 1');

    const state = db.bufferPool.state();
    expect(state.frames.length).toBeGreaterThan(0);
    expect(state.reads).toBeGreaterThan(state.frames.length);
  });
});

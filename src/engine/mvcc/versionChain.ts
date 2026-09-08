import type { UndoLog } from '../logs/undoLog';
import type { ClusteredRecord, Row } from '../schema/record';
import { isVisible, type ReadView } from './readView';

export interface VisibleVersion {
  row: Row | null;
  /** How many undo records had to be walked to get here. */
  hops: number;
  /** trx id of the version that ended up visible, or null when nothing is. */
  trxId: number | null;
  deleted: boolean;
}

/**
 * Walks a row's version chain until it finds a version the read view may see.
 * The chain lives in the undo log: the record points at the undo record holding the previous
 * image, which points at the one before it, and so on.
 */
export function visibleVersionOf(
  record: ClusteredRecord,
  view: ReadView | null,
  undoLog: UndoLog,
): VisibleVersion {
  // READ UNCOMMITTED has no read view at all: it just reads whatever is in the page.
  if (!view) {
    return {
      row: record.deleteMark ? null : record.row,
      hops: 0,
      trxId: record.trxId,
      deleted: record.deleteMark,
    };
  }

  if (isVisible(record.trxId, view)) {
    return {
      row: record.deleteMark ? null : record.row,
      hops: 0,
      trxId: record.trxId,
      deleted: record.deleteMark,
    };
  }

  let rollPtr = record.rollPtr;
  let hops = 0;
  while (rollPtr !== null) {
    const undo = undoLog.get(rollPtr);
    if (!undo) break;
    hops += 1;

    // An INSERT_UNDO means the row did not exist in this older version.
    if (undo.kind === 'INSERT_UNDO') {
      return { row: null, hops, trxId: null, deleted: true };
    }

    const olderTrxId = undo.beforeTrxId ?? 0;
    if (isVisible(olderTrxId, view)) {
      return {
        row: undo.beforeImage,
        hops,
        trxId: olderTrxId,
        deleted: undo.beforeImage === null,
      };
    }
    rollPtr = undo.rollPtr;
  }

  return { row: null, hops, trxId: null, deleted: true };
}

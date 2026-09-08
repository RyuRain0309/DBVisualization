export interface ReadView {
  /** Transaction that opened the view. Its own changes are always visible to itself. */
  creatorTrxId: number;
  /** Transactions that were still running when the view was taken. */
  activeTrxIds: number[];
  /** Smallest active trx id; anything below this was already finished. */
  minTrxId: number;
  /** Next trx id to be handed out; anything at or above it started after the view. */
  maxTrxId: number;
  createdAtStatement: number;
}

export function createReadView(
  creatorTrxId: number,
  activeTrxIds: number[],
  nextTrxId: number,
  createdAtStatement: number,
): ReadView {
  return {
    creatorTrxId,
    activeTrxIds: [...activeTrxIds],
    minTrxId: activeTrxIds.length > 0 ? Math.min(...activeTrxIds) : nextTrxId,
    maxTrxId: nextTrxId,
    createdAtStatement,
  };
}

/**
 * InnoDB's visibility rule, in the order the source checks it:
 * your own changes are visible; anything that finished before the view was taken is visible;
 * anything that started after it, or was still running when it was taken, is not.
 */
export function isVisible(trxId: number, view: ReadView): boolean {
  if (trxId === view.creatorTrxId) return true;
  if (trxId < view.minTrxId) return true;
  if (trxId >= view.maxTrxId) return false;
  return !view.activeTrxIds.includes(trxId);
}

export function describeReadView(view: ReadView): string {
  const active = view.activeTrxIds.length > 0 ? view.activeTrxIds.join(', ') : '없음';
  return `생성 트랜잭션 ${view.creatorTrxId}, 생성 시점 활성 트랜잭션 [${active}], 가시 경계 ${view.minTrxId}~${view.maxTrxId}`;
}

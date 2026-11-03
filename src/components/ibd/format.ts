import type { IbdSpace } from '../../ibd/analyze';

export function hex(value: number, digits = 8): string {
  return `0x${value.toString(16).padStart(digits, '0')}`;
}

export function bytesLabel(size: number): string {
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} byte`;
}

/** 80046 → 8.0.46 */
export function mysqlVersion(id: number): string {
  return `${Math.floor(id / 10000)}.${Math.floor(id / 100) % 100}.${id % 100}`;
}

/** "PRIMARY 리프" for a segment id, from the FSEG headers on each root page. */
export function segmentLabel(space: IbdSpace, segId: bigint): string {
  for (const index of space.indexes) {
    if (index.leaf?.segId === segId) return `${index.name} 리프`;
    if (index.nonLeaf?.segId === segId) return `${index.name} 논리프`;
  }
  return `세그먼트 ${segId}`;
}

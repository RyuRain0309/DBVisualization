import type { IbdSpace } from '../../ibd/analyze';
import { pageType, type PageGroup } from '../../ibd/pageTypes';

/** How the map colours its tiles. */
export type MapMode = 'type' | 'owner' | 'fill';

export const MAP_MODES: { id: MapMode; label: string }[] = [
  { id: 'type', label: '페이지 종류' },
  { id: 'owner', label: '소유 인덱스' },
  { id: 'fill', label: '채움 정도' },
];

export interface Paint {
  fill: string;
  stroke?: string;
  /** A small square in the middle, for LOB pages drawn in their owner's colour. */
  mark?: string;
}

export interface LegendItem {
  label: string;
  paint: Paint;
  count: number;
}

const GROUP_COLOR: Record<PageGroup, string> = {
  space: '#64748b',
  inode: '#8b5cf6',
  sdi: '#f59e0b',
  index: '#3b82f6',
  lob: '#10b981',
  allocated: '#dfe4ec',
  other: '#ec4899',
};

const GROUP_LABEL: Record<PageGroup, string> = {
  space: 'FSP_HDR · XDES · IBUF_BITMAP',
  inode: 'INODE',
  sdi: 'SDI',
  index: 'INDEX',
  lob: 'LOB · BLOB',
  allocated: 'ALLOCATED (쓴 적 없음)',
  other: '그 밖의 타입',
};

/** XDES says free: the page may still hold what it had before it was freed. */
const FREE: Paint = { fill: '#ffffff', stroke: '#c3cad6' };
/** Past FSP_FREE_LIMIT: the file has the bytes but no extent was set up there yet. */
const UNINIT: Paint = { fill: '#eef1f6' };

/** Non-leaf colour first, leaf colour second; one pair per index in root order. */
const INDEX_COLORS: [string, string][] = [
  ['#1d4ed8', '#93c5fd'],
  ['#7c3aed', '#c4b5fd'],
  ['#b45309', '#fcd34d'],
  ['#047857', '#6ee7b7'],
  ['#be185d', '#f9a8d4'],
  ['#0e7490', '#67e8f9'],
];
const SDI_COLORS: [string, string] = ['#78716c', '#d6d3d1'];
const SPACE_PAGE = '#64748b';
const UNOWNED = '#cbd5e1';

export function indexColors(space: IbdSpace, position: number): [string, string] {
  const index = space.indexes[position]!;
  if (index.kind === 'sdi') return SDI_COLORS;
  const others = space.indexes.slice(0, position).filter((one) => one.kind !== 'sdi').length;
  return INDEX_COLORS[others % INDEX_COLORS.length]!;
}

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i]! - v) * t)).join(',')})`;
}

const FILL_LOW = '#dbeafe';
const FILL_HIGH = '#1e3a8a';

/** The paint of every page for one mode, computed once per mode rather than per frame. */
export function paintAll(space: IbdSpace, mode: MapMode): Paint[] {
  return space.pages.map((page) => {
    const allocation = space.allocation[page.pageNo];
    if (allocation === 'uninit') return UNINIT;
    if (allocation === 'free') return FREE;
    const group = pageType(page.type).group;

    if (mode === 'type') return { fill: GROUP_COLOR[group] };

    if (mode === 'fill') {
      if (page.level < 0) return { fill: '#e8ecf2' };
      return { fill: mix(FILL_LOW, FILL_HIGH, page.fill) };
    }

    const owner = space.owners[page.pageNo];
    if (!owner) return { fill: group === 'space' || group === 'inode' ? SPACE_PAGE : UNOWNED };
    const [nonLeaf, leaf] = indexColors(space, owner.index);
    return {
      fill: owner.segment === 'leaf' ? leaf : nonLeaf,
      mark: group === 'lob' ? '#ffffff' : undefined,
    };
  });
}

export function legendFor(space: IbdSpace, mode: MapMode): LegendItem[] {
  const uninit = space.allocation.filter((a) => a === 'uninit').length;
  const free = space.allocation.filter((a) => a === 'free').length;
  const used = space.pages.filter((page) => space.allocation[page.pageNo] === 'used');
  const tail: LegendItem[] = [
    { label: 'XDES 상 빈 페이지', paint: FREE, count: free },
    { label: 'FSP_FREE_LIMIT 너머 (초기화 전)', paint: UNINIT, count: uninit },
  ];

  if (mode === 'type') {
    const counts = new Map<PageGroup, number>();
    for (const page of used) {
      const group = pageType(page.type).group;
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    const groups = Object.keys(GROUP_LABEL) as PageGroup[];
    return [
      ...groups
        .filter((group) => counts.has(group))
        .map((group) => ({ label: GROUP_LABEL[group], paint: { fill: GROUP_COLOR[group] }, count: counts.get(group)! })),
      ...tail,
    ];
  }

  if (mode === 'fill') {
    const btree = used.filter((page) => page.level >= 0);
    return [
      { label: 'B+tree 페이지 · 절반 미만 사용', paint: { fill: mix(FILL_LOW, FILL_HIGH, 0.25) }, count: btree.filter((p) => p.fill < 0.5).length },
      { label: 'B+tree 페이지 · 절반 이상 사용', paint: { fill: mix(FILL_LOW, FILL_HIGH, 0.85) }, count: btree.filter((p) => p.fill >= 0.5).length },
      { label: 'B+tree 가 아닌 페이지', paint: { fill: '#e8ecf2' }, count: used.length - btree.length },
      ...tail,
    ];
  }

  const items: LegendItem[] = [];
  space.indexes.forEach((index, position) => {
    const [nonLeaf, leaf] = indexColors(space, position);
    const owned = (segment: 'leaf' | 'nonleaf') =>
      used.filter((page) => {
        const owner = space.owners[page.pageNo];
        return owner?.index === position && owner.segment === segment;
      }).length;
    items.push({ label: `${index.name} · 논리프 세그먼트`, paint: { fill: nonLeaf }, count: owned('nonleaf') });
    items.push({ label: `${index.name} · 리프 세그먼트`, paint: { fill: leaf }, count: owned('leaf') });
  });
  const lob = used.filter((page) => pageType(page.type).group === 'lob' && space.owners[page.pageNo]).length;
  if (lob > 0) items.push({ label: '그중 LOB 페이지', paint: { fill: '#94a3b8', mark: '#ffffff' }, count: lob });
  const unowned = used.filter((page) => !space.owners[page.pageNo]);
  const isManagement = (type: number) => ['space', 'inode'].includes(pageType(type).group);
  items.push({
    label: '세그먼트에 속하지 않는 관리용 페이지',
    paint: { fill: SPACE_PAGE },
    count: unowned.filter((page) => isManagement(page.type)).length,
  });
  const orphan = unowned.filter((page) => !isManagement(page.type)).length;
  if (orphan > 0) items.push({ label: '소유 세그먼트를 찾지 못한 페이지', paint: { fill: UNOWNED }, count: orphan });
  return [...items, ...tail];
}

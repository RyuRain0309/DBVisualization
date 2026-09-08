import type { BTreeMutation } from '../btree/types';
import { formatKey, type Row } from '../schema/record';

export function describeMutation(mutation: BTreeMutation): string {
  switch (mutation.type) {
    case 'insert-entry':
      return `페이지 ${mutation.pageId} 의 ${mutation.slot}번 자리에 키 (${formatKey(mutation.key)}) 삽입`;
    case 'update-entry':
      return `페이지 ${mutation.pageId} 의 키 (${formatKey(mutation.key)}) 레코드를 새 버전으로 교체`;
    case 'remove-entry':
      return `페이지 ${mutation.pageId} 에서 키 (${formatKey(mutation.key)}) 제거`;
    case 'page-split':
      return `페이지 ${mutation.pageId} 가 가득 차 분할. 뒤쪽 ${mutation.movedEntries}개 엔트리를 새 페이지 ${mutation.newPageId} 로 옮기고, 분리 키 (${formatKey(mutation.separatorKey)}) 를 부모에 등록`;
    case 'page-merge':
      return `페이지 ${mutation.removedPageId} 가 절반 미만으로 비어 페이지 ${mutation.pageId} 에 병합 (${mutation.movedEntries}개 이동)`;
    case 'redistribute':
      return `형제 페이지 ${mutation.fromPageId} 에서 키 (${formatKey(mutation.key)}) 를 빌려와 페이지 ${mutation.toPageId} 의 부족분 해소`;
    case 'new-root':
      return `새 루트 페이지 ${mutation.pageId} 생성 (레벨 ${mutation.level}). 트리 높이가 한 단계 늘었다`;
    case 'root-shrink':
      return mutation.newRootId === null
        ? `마지막 레코드가 사라져 인덱스가 비었다 (페이지 ${mutation.removedPageId} 해제)`
        : `루트 페이지 ${mutation.removedPageId} 에 자식이 하나만 남아 트리 높이 감소. 새 루트는 페이지 ${mutation.newRootId}`;
    case 'parent-key-update':
      return `부모 페이지 ${mutation.pageId} 가 가리키는 최소 키를 (${formatKey(mutation.oldKey)}) 에서 (${formatKey(mutation.newKey)}) 로 갱신`;
  }
}

export function describeRow(row: Row): string {
  return Object.entries(row)
    .map(([column, value]) => `${column}=${value === null ? 'NULL' : String(value)}`)
    .join(', ');
}

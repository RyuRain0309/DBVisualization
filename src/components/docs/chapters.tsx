import type { ComponentType } from 'react';
import { ComponentsChapter } from './ComponentsChapter';
import { IndexChapter } from './IndexChapter';
import { PageChapter } from './PageChapter';
import { RecordChapter } from './RecordChapter';
import { StorageChapter } from './StorageChapter';

export interface Chapter {
  id: string;
  title: string;
  blurb: string;
  Body: ComponentType;
}

/** Reading order: what the pieces are, then where a row physically ends up, then how it is found. */
export const CHAPTERS: Chapter[] = [
  {
    id: 'components',
    title: '구성요소와 담당',
    blurb: '버퍼 풀 · redo · undo · 테이블스페이스가 각각 맡는 일',
    Body: ComponentsChapter,
  },
  {
    id: 'storage',
    title: '데이터가 놓이는 자리',
    blurb: '파일 → 세그먼트 → 익스텐트 → 페이지 → 행',
    Body: StorageChapter,
  },
  {
    id: 'page',
    title: '페이지 한 장의 안쪽',
    blurb: '헤더 · 레코드 · 디렉터리, 그리고 분할과 병합',
    Body: PageChapter,
  },
  {
    id: 'record',
    title: '행 하나의 생김새',
    blurb: '레코드 바이트 구성과 숨은 컬럼, 그리고 버전 체인',
    Body: RecordChapter,
  },
  {
    id: 'index',
    title: '페이지가 트리가 될 때',
    blurb: '클러스터드 · 세컨더리 인덱스와 탐색 경로',
    Body: IndexChapter,
  },
];

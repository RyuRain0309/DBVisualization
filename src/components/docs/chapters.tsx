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
    title: 'InnoDB 구성요소',
    blurb: '버퍼 풀 · 로그 · 테이블스페이스가 맡는 일',
    Body: ComponentsChapter,
  },
  {
    id: 'storage',
    title: '저장 구조 계층',
    blurb: '파일 → 세그먼트 → 익스텐트 → 페이지 → 행',
    Body: StorageChapter,
  },
  {
    id: 'page',
    title: '페이지 내부 구조',
    blurb: '헤더 · 레코드 · 디렉터리 · 분할과 병합',
    Body: PageChapter,
  },
  {
    id: 'record',
    title: '레코드 내부 구조',
    blurb: '레코드 필드 구성과 숨은 컬럼',
    Body: RecordChapter,
  },
  {
    id: 'index',
    title: '인덱스 구조',
    blurb: '클러스터드 · 세컨더리 인덱스와 탐색 경로',
    Body: IndexChapter,
  },
];

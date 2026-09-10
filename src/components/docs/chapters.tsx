import type { ComponentType } from 'react';
import { ComponentsChapter } from './ComponentsChapter';

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
];

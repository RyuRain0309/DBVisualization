import type { ComponentType } from 'react';
import { ComponentsChapter } from './ComponentsChapter';
import { IndexChapter } from './IndexChapter';
import { MvccChapter } from './MvccChapter';
import { OptimizerChapter } from './OptimizerChapter';
import { PageChapter } from './PageChapter';
import { RecordChapter } from './RecordChapter';
import { SegmentChapter } from './SegmentChapter';
import { StorageChapter } from './StorageChapter';
import { TablespaceChapter } from './TablespaceChapter';

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
    blurb: '서버 레이어와 스토리지 엔진의 경계, 그리고 각 구성요소',
    Body: ComponentsChapter,
  },
  {
    id: 'storage',
    title: '저장 구조 계층',
    blurb: '.ibd 파일 내부가 나뉘는 단위',
    Body: StorageChapter,
  },
  {
    id: 'tablespace',
    title: '테이블스페이스 내부 구조',
    blurb: '.ibd 파일 하나에 무엇이 들어가는지',
    Body: TablespaceChapter,
  },
  {
    id: 'segment',
    title: '세그먼트 · 익스텐트 구조',
    blurb: '공간을 나누는 단위와 소유하는 단위',
    Body: SegmentChapter,
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
    blurb: '레코드 필드 구성과 Hidden Column',
    Body: RecordChapter,
  },
  {
    id: 'index',
    title: '인덱스 구조',
    blurb: '클러스터드 · 세컨더리 인덱스와 탐색 경로',
    Body: IndexChapter,
  },
  {
    id: 'optimizer',
    title: '질의 실행 경로',
    blurb: '파서 · 옵티마이저 · 실행기가 SQL 을 엔진 호출로 바꾸는 과정',
    Body: OptimizerChapter,
  },
  {
    id: 'mvcc',
    title: 'MVCC 동작 방식',
    blurb: 'read view 와 버전 체인으로 락 없이 읽기',
    Body: MvccChapter,
  },
];

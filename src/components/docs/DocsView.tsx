import { useEffect, useRef, useState } from 'react';
import { AppMark } from '../onboarding/AppMark';
import { CHAPTERS } from './chapters';
import { useEngineStore } from '../../store/engineStore';

/**
 * The reader shows one chapter at a time rather than one long scroll: each chapter is a whole
 * idea, and jumping back to the top of a 5000px page after every nav click reads worse.
 */
export function DocsView() {
  const closeDocs = useEngineStore((state) => state.closeDocs);
  const start = useEngineStore((state) => state.start);

  const [activeId, setActiveId] = useState(CHAPTERS[0]!.id);
  const index = Math.max(
    0,
    CHAPTERS.findIndex((chapter) => chapter.id === activeId),
  );
  const chapter = CHAPTERS[index]!;
  const previous = CHAPTERS[index - 1];
  const next = CHAPTERS[index + 1];

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [activeId]);

  return (
    <div className="docs">
      <header className="docs__bar">
        <button type="button" className="button" onClick={closeDocs}>
          ← 처음으로
        </button>
        <div className="docs__brand">
          <AppMark className="docs__mark" />
          <strong>문서</strong>
          <span>InnoDB 가 데이터를 어디에 어떻게 두는지</span>
        </div>
        <button type="button" className="button button--primary" onClick={start}>
          시작하기
        </button>
      </header>

      <div className="docs__body">
        <nav className="docs__nav">
          {CHAPTERS.map((entry, position) => (
            <button
              key={entry.id}
              type="button"
              className={`docs__link ${entry.id === activeId ? 'docs__link--active' : ''}`}
              onClick={() => setActiveId(entry.id)}
            >
              <span className="docs__num">{String(position + 1).padStart(2, '0')}</span>
              <span className="docs__link-text">
                <b>{entry.title}</b>
                <em>{entry.blurb}</em>
              </span>
            </button>
          ))}
        </nav>

        <div className="docs__content" ref={scroller}>
          <article className="doc">
            <header className="doc__head">
              <span className="doc__num">{String(index + 1).padStart(2, '0')}</span>
              <h2>{chapter.title}</h2>
              <p>{chapter.blurb}</p>
            </header>

            <chapter.Body />

            <nav className="doc__pager">
              {previous ? (
                <button type="button" className="button" onClick={() => setActiveId(previous.id)}>
                  ← {previous.title}
                </button>
              ) : (
                <span />
              )}
              {next && (
                <button type="button" className="button" onClick={() => setActiveId(next.id)}>
                  {next.title} →
                </button>
              )}
            </nav>
          </article>
        </div>
      </div>
    </div>
  );
}

import { useEngineStore } from '../../store/engineStore';

export function StepControls() {
  const steps = useEngineStore((state) => state.steps);
  const cursor = useEngineStore((state) => state.cursor);
  const setCursor = useEngineStore((state) => state.setCursor);
  const stepForward = useEngineStore((state) => state.stepForward);
  const stepBackward = useEngineStore((state) => state.stepBackward);
  const jumpToEnd = useEngineStore((state) => state.jumpToEnd);

  const total = steps.length;
  const current = steps[cursor]?.event ?? null;

  return (
    <section className="steps">
      <div className="steps__bar">
        <button type="button" className="button" disabled={total === 0} onClick={() => setCursor(0)}>
          ⏮
        </button>
        <button type="button" className="button" disabled={cursor <= 0} onClick={stepBackward}>
          ◀ 이전
        </button>
        <span className="steps__counter">
          {total === 0 ? '0 / 0' : `${cursor + 1} / ${total}`}
        </span>
        <button
          type="button"
          className="button"
          disabled={cursor >= total - 1}
          onClick={stepForward}
        >
          다음 ▶
        </button>
        <button type="button" className="button" disabled={total === 0} onClick={jumpToEnd}>
          ⏭
        </button>
      </div>

      <input
        className="steps__slider"
        type="range"
        min={0}
        max={Math.max(0, total - 1)}
        value={Math.max(0, cursor)}
        disabled={total === 0}
        onChange={(event) => setCursor(Number(event.target.value))}
      />

      <p className="steps__current">
        {current ? current.explanation : 'SQL 을 실행하면 단계별로 무슨 일이 일어나는지 보인다.'}
      </p>
    </section>
  );
}

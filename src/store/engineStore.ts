import { create } from 'zustand';
import type { EngineSnapshot, ExecutionStep } from '../engine/executor/events';
import { DEFAULT_PAGE_CAPACITY, Session } from '../engine/transaction/session';

export interface HistoryEntry {
  sql: string;
  error: string | null;
  firstStep: number;
  lastStep: number;
}

interface EngineState {
  session: Session;
  pageCapacity: number;
  steps: ExecutionStep[];
  /** Index of the step currently shown; -1 means "nothing executed yet". */
  cursor: number;
  history: HistoryEntry[];
  error: string | null;
  /** When on, running SQL parks the cursor on the first new step so it can be walked manually. */
  stepwise: boolean;

  run: (sql: string) => void;
  setCursor: (index: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  jumpToEnd: () => void;
  setStepwise: (stepwise: boolean) => void;
  setPageCapacity: (capacity: number) => void;
  reset: () => void;
  snapshot: () => EngineSnapshot;
}

function emptyState(pageCapacity: number) {
  return {
    session: new Session(pageCapacity),
    pageCapacity,
    steps: [] as ExecutionStep[],
    cursor: -1,
    history: [] as HistoryEntry[],
    error: null as string | null,
  };
}

export const useEngineStore = create<EngineState>((set, get) => ({
  ...emptyState(DEFAULT_PAGE_CAPACITY),
  stepwise: false,

  run: (sql: string) => {
    const { session, steps, history, stepwise } = get();
    const result = session.run(sql);
    if (result.steps.length === 0 && !result.error) return;

    const firstStep = steps.length;
    const merged = [...steps, ...result.steps];
    set({
      steps: merged,
      cursor: stepwise ? firstStep : merged.length - 1,
      error: result.error,
      history: [
        ...history,
        { sql, error: result.error, firstStep, lastStep: merged.length - 1 },
      ],
    });
  },

  setCursor: (index) => {
    const { steps } = get();
    if (steps.length === 0) return;
    set({ cursor: Math.max(0, Math.min(index, steps.length - 1)) });
  },

  stepForward: () => get().setCursor(get().cursor + 1),
  stepBackward: () => get().setCursor(get().cursor - 1),
  jumpToEnd: () => get().setCursor(get().steps.length - 1),
  setStepwise: (stepwise) => set({ stepwise }),

  /** Page capacity is baked into the trees, so changing it starts a fresh session. */
  setPageCapacity: (capacity) => set({ ...emptyState(capacity) }),

  reset: () => set({ ...emptyState(get().pageCapacity) }),

  snapshot: () => {
    const { steps, cursor, session } = get();
    return cursor >= 0 && steps[cursor] ? steps[cursor]!.snapshot : session.snapshot();
  },
}));

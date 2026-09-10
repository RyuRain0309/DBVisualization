import { create } from 'zustand';
import type { EngineSnapshot, ExecutionStep } from '../engine/executor/events';
import { DEFAULT_PAGE_CAPACITY, Database } from '../engine/transaction/database';
import type { Session } from '../engine/transaction/session';

/** Which top-level screen is on: the landing page, the docs reader, or the workspace. */
export type AppView = 'welcome' | 'docs' | 'app';

export interface ConsoleState {
  sessionId: number;
  name: string;
  /** Editor contents, kept per console so each one can hold its own script. */
  sql: string;
  error: string | null;
}

const STARTER_SQL = `CREATE TABLE users (
  id INT NOT NULL,
  name VARCHAR(20),
  email VARCHAR(30),
  PRIMARY KEY (id),
  KEY idx_email (email)
);
INSERT INTO users VALUES (10, 'a', 'a@x.com');
INSERT INTO users VALUES (20, 'b', 'b@x.com');
INSERT INTO users VALUES (30, 'c', 'c@x.com');`;

const SECOND_CONSOLE_SQL = `BEGIN;
UPDATE users SET name = 'from session 2' WHERE id = 20;`;

interface EngineState {
  database: Database;
  sessions: Session[];
  consoles: ConsoleState[];
  activeConsole: number;
  pageCapacity: number;
  steps: ExecutionStep[];
  /** Index of the step currently shown; -1 means "nothing executed yet". */
  cursor: number;
  stepwise: boolean;
  view: AppView;

  start: () => void;
  openDocs: () => void;
  closeDocs: () => void;
  run: (sessionId: number) => void;
  runSql: (sessionId: number, sql: string) => void;
  checkpoint: () => void;
  setSql: (sessionId: number, sql: string) => void;
  addConsole: () => void;
  removeConsole: (sessionId: number) => void;
  setActiveConsole: (sessionId: number) => void;
  setCursor: (index: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  jumpToEnd: () => void;
  setStepwise: (stepwise: boolean) => void;
  setPageCapacity: (capacity: number) => void;
  reset: () => void;
  snapshotAt: () => EngineSnapshot;
}

function freshDatabase(pageCapacity: number) {
  const database = new Database(pageCapacity);
  const first = database.openSession();
  const second = database.openSession();

  return {
    database,
    sessions: [first, second],
    consoles: [
      { sessionId: first.id, name: first.name, sql: STARTER_SQL, error: null },
      { sessionId: second.id, name: second.name, sql: SECOND_CONSOLE_SQL, error: null },
    ] as ConsoleState[],
    activeConsole: first.id,
    pageCapacity,
    steps: [] as ExecutionStep[],
    cursor: -1,
  };
}

export const useEngineStore = create<EngineState>((set, get) => ({
  ...freshDatabase(DEFAULT_PAGE_CAPACITY),
  stepwise: false,
  view: 'welcome',

  start: () => set({ view: 'app' }),
  openDocs: () => set({ view: 'docs' }),
  closeDocs: () => set({ view: 'welcome' }),

  setSql: (sessionId, sql) =>
    set({
      consoles: get().consoles.map((console) =>
        console.sessionId === sessionId ? { ...console, sql } : console,
      ),
    }),

  run: (sessionId) => {
    const console = get().consoles.find((entry) => entry.sessionId === sessionId);
    if (console) get().runSql(sessionId, console.sql);
  },

  runSql: (sessionId, sql) => {
    const { sessions, steps, stepwise, consoles } = get();
    const session = sessions.find((entry) => entry.id === sessionId);
    if (!session || sql.trim().length === 0) return;

    const result = session.run(sql);
    if (result.steps.length === 0) return;

    const firstStep = steps.length;
    const merged = [...steps, ...result.steps];
    set({
      steps: merged,
      cursor: stepwise ? firstStep : merged.length - 1,
      consoles: consoles.map((entry) =>
        entry.sessionId === sessionId ? { ...entry, error: result.error } : entry,
      ),
    });
  },

  /** Flushes dirty pages, the way a background checkpoint would. */
  checkpoint: () => {
    const { sessions, steps } = get();
    const session = sessions[0];
    if (!session) return;

    const result = session.checkpoint();
    if (result.steps.length === 0) return;
    const merged = [...steps, ...result.steps];
    set({ steps: merged, cursor: merged.length - 1 });
  },

  addConsole: () => {
    const { database, sessions, consoles } = get();
    const session = database.openSession();
    set({
      sessions: [...sessions, session],
      consoles: [
        ...consoles,
        { sessionId: session.id, name: session.name, sql: 'BEGIN;\n', error: null },
      ],
      activeConsole: session.id,
    });
  },

  /** Closing a console disconnects the session, which rolls back its open transaction. */
  removeConsole: (sessionId) => {
    const { database, sessions, consoles, steps, activeConsole } = get();
    if (consoles.length <= 1) return;
    const session = sessions.find((entry) => entry.id === sessionId);
    if (!session) return;

    database.beginCollecting();
    database.closeSession(session);
    const closingSteps = database.collectedSteps();

    const remaining = consoles.filter((entry) => entry.sessionId !== sessionId);
    const merged = [...steps, ...closingSteps];
    set({
      sessions: sessions.filter((entry) => entry.id !== sessionId),
      consoles: remaining,
      steps: merged,
      cursor: merged.length - 1,
      activeConsole: activeConsole === sessionId ? remaining[0]!.sessionId : activeConsole,
    });
  },

  setActiveConsole: (sessionId) => set({ activeConsole: sessionId }),

  setCursor: (index) => {
    const { steps } = get();
    if (steps.length === 0) return;
    set({ cursor: Math.max(0, Math.min(index, steps.length - 1)) });
  },

  stepForward: () => get().setCursor(get().cursor + 1),
  stepBackward: () => get().setCursor(get().cursor - 1),
  jumpToEnd: () => get().setCursor(get().steps.length - 1),
  setStepwise: (stepwise) => set({ stepwise }),

  /** Page capacity is baked into the trees, so changing it starts a fresh database. */
  setPageCapacity: (capacity) => set({ ...freshDatabase(capacity) }),

  reset: () => set({ ...freshDatabase(get().pageCapacity) }),

  snapshotAt: () => {
    const { steps, cursor, database } = get();
    return cursor >= 0 && steps[cursor] ? steps[cursor]!.snapshot : database.snapshot();
  },
}));

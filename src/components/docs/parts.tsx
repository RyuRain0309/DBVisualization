import type { ReactNode } from 'react';

/** One numbered chapter body block: a heading plus prose. */
export function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="doc-block">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** A drawing, with the sentence it is meant to prove underneath it when one is needed. */
export function Figure({ caption, children }: { caption?: string; children: ReactNode }) {
  return (
    <figure className="doc-figure">
      {children}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/**
 * Marks where this simulator departs from real InnoDB. The app labels its own simplifications,
 * so the docs have to do the same instead of letting the reader assume everything is modelled.
 * Tagged 참고 rather than 단순화: some of these notes point at what the simulator models
 * faithfully, not only at what it leaves out.
 */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="doc-note">
      <span className="doc-note__tag">참고</span>
      {children}
    </p>
  );
}

/** A named subsection inside a Block, for when one component has two separate mechanisms. */
export function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="doc-sub">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

/** Term on the left, what it is responsible for on the right. */
export function Roles({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="doc-roles">
      {rows.map(([term, role]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{role}</dd>
        </div>
      ))}
    </dl>
  );
}

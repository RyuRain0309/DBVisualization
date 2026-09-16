import type { ReactNode } from 'react';

/** One numbered chapter body block: a heading plus prose. */
/** Which side of the architecture diagram a component sits on; 'both' shows one badge each. */
export type Side = 'memory' | 'disk' | 'both';

const SIDE_LABEL = {
  memory: 'In-Memory',
  disk: 'On-Disk',
} as const;

function badgesFor(side: Side): Array<keyof typeof SIDE_LABEL> {
  return side === 'both' ? ['memory', 'disk'] : [side];
}

export function Block({
  title,
  side,
  children,
}: {
  title: string;
  side?: Side;
  children: ReactNode;
}) {
  return (
    <section className="doc-block">
      <h3>
        {title}
        {side &&
          badgesFor(side).map((one) => (
            <span key={one} className={`doc-side doc-side--${one}`}>
              {SIDE_LABEL[one]}
            </span>
          ))}
      </h3>
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

/**
 * MySQL 8.0 defaults for the settings these chapters mention. Kept here rather than inline so the
 * same value cannot drift between two chapters that name the same variable.
 */
const DEFAULTS: Record<string, string> = {
  innodb_adaptive_flushing: 'ON',
  innodb_change_buffer_max_size: '25 (버퍼 풀의 %)',
  innodb_fast_shutdown: '1',
  innodb_flush_log_at_trx_commit: '1',
  innodb_io_capacity: '200',
  innodb_log_buffer_size: '16777216 (16MB)',
  innodb_lru_scan_depth: '1024',
  innodb_old_blocks_pct: '37 (%)',
  innodb_old_blocks_time: '1000 (ms)',
  innodb_page_size: '16384 (16KB)',
  innodb_redo_log_capacity: '104857600 (100MB)',
};

/** A setting name that shows its default on hover. */
export function Var({ name }: { name: string }) {
  const fallback = DEFAULTS[name];
  return (
    <code className="doc-var" data-default={fallback ? `기본값 ${fallback}` : undefined}>
      {name}
    </code>
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

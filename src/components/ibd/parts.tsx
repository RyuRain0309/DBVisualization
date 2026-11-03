import type { ReactNode } from 'react';
import { FIL_NULL } from '../../ibd/bytes';
import { formatPath } from '../../router';

/** One stored field: its InnoDB identifier, the value in this file, and what it means. */
export type FieldRow = [name: string, value: ReactNode, note?: ReactNode];

export function FieldTable({ rows }: { rows: FieldRow[] }) {
  return (
    <table className="ibd-fields">
      <tbody>
        {rows.map(([name, value, note]) => (
          <tr key={name}>
            <th>
              <code>{name}</code>
            </th>
            <td className="ibd-fields__value">{value}</td>
            <td className="ibd-fields__note">{note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A page number that opens that page; FIL_NULL reads as "없음". */
export function PageLink({ pageNo, onSelect }: { pageNo: number; onSelect: (pageNo: number) => void }) {
  if (pageNo === FIL_NULL) return <span className="ibd-dim">없음 (FIL_NULL)</span>;
  return (
    <button type="button" className="ibd-pagelink" onClick={() => onSelect(pageNo)}>
      {pageNo}
    </button>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="ibd-section">
      <h3>
        {title}
        {aside && <span className="ibd-section__aside">{aside}</span>}
      </h3>
      {children}
    </section>
  );
}

/**
 * A pointer to the chapter that explains what is on screen. Opens a new tab: following it in
 * place would unload the file the reader just opened.
 */
export function DocRef({ chapter, children }: { chapter: string; children: ReactNode }) {
  return (
    <a className="ibd-docref" href={formatPath({ view: 'docs', param: chapter })} target="_blank" rel="noreferrer">
      {children} ↗
    </a>
  );
}

/**
 * Storage seen through a lens: the database cylinder with a magnifier over it.
 * Drawn for this project, so there is no vendor trademark involved.
 */
export function AppMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 96" role="img" aria-label="InnoDB Visualizer">
      <g className="mark" fill="none" strokeWidth={5} strokeLinecap="round">
        <ellipse cx="40" cy="24" rx="24" ry="9" />
        <path d="M16 24 v16 c0 5 10.7 9 24 9 s24-4 24-9 V24" />
        <path d="M16 40 v16 c0 5 10.7 9 24 9 2 0 4-.1 6-.3" />
        <circle className="mark__lens" cx="62" cy="62" r="16" />
        <path d="M74 74 L88 88" />
      </g>
    </svg>
  );
}

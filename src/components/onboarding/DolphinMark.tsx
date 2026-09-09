/**
 * An original dolphin silhouette drawn for this project — a nod to the animal databases like
 * to put on their covers, not a copy of any vendor's trademarked logo.
 */
export function DolphinMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 72" role="img" aria-label="InnoDB Visualizer">
      <g className="dolphin">
        {/* tail flukes */}
        <path
          className="dolphin__fin"
          d="M12 52 C 6 47, 2 40, 3 32 C 8 40, 13 45, 18 47 C 16 49, 14 51, 12 52 Z"
        />
        <path
          className="dolphin__fin"
          d="M12 52 C 10 58, 6 65, 1 69 C 9 65, 15 59, 19 53 C 16 53, 14 52, 12 52 Z"
        />
        {/* dorsal fin */}
        <path
          className="dolphin__fin"
          d="M44 27 C 47 18, 53 11, 62 7 C 57 15, 54 22, 52 30 C 49 28, 46 27, 44 27 Z"
        />
        {/* pectoral fin */}
        <path
          className="dolphin__fin"
          d="M47 41 C 44 48, 39 54, 31 58 C 35 50, 39 44, 42 38 C 44 39, 45 40, 47 41 Z"
        />
        {/* body: beak on the right, arching down to the peduncle on the left */}
        <path
          className="dolphin__body"
          d="M93 25
             C 84 15, 68 11, 54 17
             C 42 22, 33 33, 25 43
             C 21 48, 17 51, 11 52
             C 17 56, 25 56, 31 53
             C 41 48, 49 40, 59 34
             C 69 28, 81 25, 89 27
             C 92 28, 94 27, 93 25 Z"
        />
        <circle className="dolphin__eye" cx="79" cy="23" r="2.1" />
      </g>
    </svg>
  );
}

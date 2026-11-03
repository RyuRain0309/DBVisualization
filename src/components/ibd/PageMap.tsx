import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type { Paint } from './paint';

/** One row is one extent of a 16KB-page file. */
const COLS = 64;
/** Room on the left for the page number each row starts at. */
const GUTTER = 52;
const PAD = 6;
const MAX_HEIGHT = 540;

interface Props {
  pageCount: number;
  /** Pages per extent: a thicker line marks where an extent ends when it spans several rows. */
  extentPages: number;
  paints: Paint[];
  selected: number | null;
  onSelect: (pageNo: number) => void;
  tooltip: (pageNo: number) => ReactNode;
}

/**
 * Every page of the file as one tile. Drawn on a canvas, and only the rows in view, so a
 * multi-gigabyte file with hundreds of thousands of pages scrolls as easily as the sample.
 */
export function PageMap({ pageCount, extentPages, paints, selected, onSelect, tooltip }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(880);
  const [scrollTop, setScrollTop] = useState(0);
  const [hover, setHover] = useState<{ pageNo: number; x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  const pitch = Math.max(6, Math.min(14, Math.floor((width - GUTTER - PAD) / COLS)));
  const cell = pitch >= 9 ? pitch - 2 : pitch - 1;
  const rows = Math.ceil(pageCount / COLS);
  const total = rows * pitch + PAD * 2;
  const height = Math.min(total, MAX_HEIGHT);
  const rowsPerExtent = Math.max(1, extentPages / COLS);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const firstRow = Math.max(0, Math.floor((scrollTop - PAD) / pitch));
    const lastRow = Math.min(rows - 1, Math.ceil((scrollTop + height) / pitch));
    const labelEvery = pitch >= 10 ? 1 : pitch >= 8 ? 2 : 4;
    context.font = '10px SFMono-Regular, Menlo, Consolas, monospace';
    context.textAlign = 'right';
    context.textBaseline = 'middle';

    for (let row = firstRow; row <= lastRow; row++) {
      const y = PAD + row * pitch - scrollTop;
      if (row % labelEvery === 0) {
        context.fillStyle = '#667087';
        context.fillText(String(row * COLS), GUTTER - 8, y + cell / 2);
      }
      if (rowsPerExtent > 1 && row > 0 && row % rowsPerExtent === 0) {
        context.fillStyle = '#b9c2d2';
        context.fillRect(GUTTER, y - 1.5, COLS * pitch, 1);
      }
      for (let col = 0; col < COLS; col++) {
        const pageNo = row * COLS + col;
        if (pageNo >= pageCount) break;
        const paint = paints[pageNo]!;
        const x = GUTTER + col * pitch;
        context.fillStyle = paint.fill;
        context.fillRect(x, y, cell, cell);
        if (paint.stroke) {
          context.strokeStyle = paint.stroke;
          context.lineWidth = 1;
          context.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
        }
        if (paint.mark && cell >= 6) {
          const inset = Math.floor(cell / 3);
          context.fillStyle = paint.mark;
          context.fillRect(x + inset, y + inset, cell - inset * 2, cell - inset * 2);
        }
      }
    }

    if (selected !== null) {
      const row = Math.floor(selected / COLS);
      const x = GUTTER + (selected % COLS) * pitch;
      const y = PAD + row * pitch - scrollTop;
      context.strokeStyle = '#1b2432';
      context.lineWidth = 2;
      context.strokeRect(x - 1.5, y - 1.5, cell + 3, cell + 3);
    }
  }, [width, height, scrollTop, pitch, cell, rows, rowsPerExtent, pageCount, paints, selected]);

  // A page picked from elsewhere (a link in the detail panel) is scrolled into view.
  useEffect(() => {
    const element = scroller.current;
    if (selected === null || !element) return;
    const top = PAD + Math.floor(selected / COLS) * pitch;
    if (top < element.scrollTop || top + pitch > element.scrollTop + height) {
      element.scrollTop = Math.max(0, top - height / 2);
    }
  }, [selected, pitch, height]);

  function pageAt(event: MouseEvent): { pageNo: number; x: number; y: number } | null {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const col = Math.floor((x - GUTTER) / pitch);
    const row = Math.floor((y + scrollTop - PAD) / pitch);
    const pageNo = row * COLS + col;
    if (col < 0 || col >= COLS || row < 0 || pageNo >= pageCount) return null;
    return { pageNo, x, y };
  }

  function onKeyDown(event: KeyboardEvent) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = (selected ?? 0) + step;
    if (next >= 0 && next < pageCount) onSelect(next);
  }

  return (
    <div className="pmap">
      <div
        className="pmap__scroll"
        ref={scroller}
        style={{ height }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div style={{ height: total }}>
          <canvas
            ref={canvas}
            className="pmap__canvas"
            style={{ width, height }}
            tabIndex={0}
            aria-label="파일 지도. 화살표 키로 페이지를 옮겨 다닐 수 있다"
            onMouseMove={(event) => setHover(pageAt(event))}
            onMouseLeave={() => setHover(null)}
            onClick={(event) => {
              const hit = pageAt(event);
              if (hit) onSelect(hit.pageNo);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
      {hover && (
        <div
          className="pmap__tip"
          style={{ left: Math.min(hover.x + 14, width - 220), top: hover.y + 16 }}
        >
          {tooltip(hover.pageNo)}
        </div>
      )}
    </div>
  );
}

import { useRef, useState } from 'react';

const TRIGGER = 64;
const HOLD = 52;

/**
 * Drag-down-to-refresh for the feed. Same rAF/refs technique as SwipeToRead:
 * no React re-renders while dragging. Only engages when the page is scrolled
 * to the top and the drag is clearly vertical.
 */
export default function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown>;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const indRef = useRef<HTMLDivElement | null>(null);
  const g = useRef({ startX: 0, startY: 0, pull: 0, active: false, decided: false, raf: 0 });
  const [refreshing, setRefreshing] = useState(false);

  function paint() {
    const s = g.current;
    s.raf = 0;
    const wrap = wrapRef.current;
    const ind = indRef.current;
    if (!wrap || !ind) return;
    wrap.style.transition = 'none';
    wrap.style.transform = `translate3d(0,${s.pull}px,0)`;
    ind.style.transition = 'none';
    ind.style.opacity = String(Math.min(1, s.pull / TRIGGER));
    ind.style.transform = `translate3d(-50%, ${s.pull - 44}px, 0) rotate(${(s.pull / TRIGGER) * 270}deg)`;
  }

  function schedulePaint() {
    if (!g.current.raf) g.current.raf = requestAnimationFrame(paint);
  }

  function settle(offset: number) {
    const wrap = wrapRef.current;
    const ind = indRef.current;
    if (!wrap || !ind) return;
    wrap.style.transition = 'transform 220ms cubic-bezier(0.22, 0.9, 0.3, 1)';
    wrap.style.transform = `translate3d(0,${offset}px,0)`;
    ind.style.transition = 'transform 220ms cubic-bezier(0.22, 0.9, 0.3, 1), opacity 180ms ease-out';
    if (offset === 0) {
      ind.style.opacity = '0';
      ind.style.transform = 'translate3d(-50%,-44px,0)';
    } else {
      ind.style.transform = `translate3d(-50%, ${offset - 44}px, 0) rotate(270deg)`;
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    if (refreshing) return;
    const s = g.current;
    if (window.scrollY > 1) {
      s.active = false;
      return;
    }
    s.startX = e.touches[0].clientX;
    s.startY = e.touches[0].clientY;
    s.pull = 0;
    s.active = true;
    s.decided = false;
  }

  function onTouchMove(e: React.TouchEvent) {
    const s = g.current;
    if (!s.active || refreshing) return;
    const dy = e.touches[0].clientY - s.startY;
    const dx = e.touches[0].clientX - s.startX;
    if (!s.decided) {
      if (dy > 10 && dy > Math.abs(dx) * 1.4 && window.scrollY <= 1) s.decided = true;
      else if (dy < -10 || Math.abs(dx) > 10 || window.scrollY > 1) {
        s.active = false;
        return;
      } else return;
    }
    s.pull = Math.min(120, Math.max(0, dy * 0.45));
    schedulePaint();
  }

  async function onTouchEnd() {
    const s = g.current;
    if (!s.active || refreshing) return;
    s.active = false;
    if (!s.decided) return;
    if (s.pull >= TRIGGER) {
      setRefreshing(true);
      settle(HOLD);
      const started = Date.now();
      try {
        await onRefresh();
      } catch {
        // the feed shows its own error state
      }
      // Keep the spinner visible long enough to read as intentional.
      setTimeout(() => {
        settle(0);
        setRefreshing(false);
      }, Math.max(0, 500 - (Date.now() - started)));
    } else {
      settle(0);
    }
    s.pull = 0;
  }

  return (
    <div className="relative">
      <div
        ref={indRef}
        className="pointer-events-none absolute left-1/2 top-0 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-paper shadow-md dark:border-snow/15 dark:bg-night"
        style={{ opacity: 0, transform: 'translate3d(-50%,-44px,0)' }}
        aria-hidden
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          className={`text-accent ${refreshing ? 'animate-spin' : ''}`}
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
        </svg>
      </div>
      <div
        ref={wrapRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={() => void onTouchEnd()}
        onTouchCancel={() => void onTouchEnd()}
      >
        {children}
      </div>
    </div>
  );
}

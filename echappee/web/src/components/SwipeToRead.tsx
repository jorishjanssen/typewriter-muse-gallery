import { useRef, useState } from 'react';

const TRIGGER_PX = 72;

/**
 * Horizontal swipe on a feed card toggles its read state. Vertical movement
 * is left alone (scrolling). A successful swipe slides the card out before
 * firing onToggle, and taps are suppressed right after a swipe so the card
 * doesn't also navigate.
 */
export default function SwipeToRead({
  read,
  onToggle,
  children,
}: {
  read: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiping = useRef(false);
  const suppressClick = useRef(false);

  function onTouchStart(e: React.TouchEvent) {
    if (leaving !== null) return;
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    swiping.current = false;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!start.current || leaving !== null) return;
    const moveX = e.touches[0].clientX - start.current.x;
    const moveY = e.touches[0].clientY - start.current.y;
    if (!swiping.current) {
      if (Math.abs(moveX) > 12 && Math.abs(moveX) > Math.abs(moveY) * 1.5) {
        swiping.current = true;
      } else if (Math.abs(moveY) > 12) {
        start.current = null; // vertical scroll — hands off
        return;
      }
    }
    if (swiping.current) setDx(moveX);
  }

  function onTouchEnd() {
    if (swiping.current) {
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 400);
      if (Math.abs(dx) >= TRIGGER_PX) {
        const direction = Math.sign(dx) * (typeof window !== 'undefined' ? window.innerWidth : 400);
        setLeaving(direction);
        setTimeout(() => {
          onToggle();
          setLeaving(null);
          setDx(0);
        }, 180);
        start.current = null;
        swiping.current = false;
        return;
      }
    }
    setDx(0);
    start.current = null;
    swiping.current = false;
  }

  const offset = leaving ?? dx;
  const engaged = Math.abs(offset) >= TRIGGER_PX;

  return (
    <div className="relative overflow-hidden">
      {offset !== 0 && (
        <div
          className={`absolute inset-0 flex items-center ${offset > 0 ? 'justify-start' : 'justify-end'} px-5 text-sm font-semibold transition-colors ${
            engaged ? 'text-accent' : 'text-ink/30 dark:text-snow/30'
          }`}
          aria-hidden
        >
          {read ? '↺ Unread' : '✓ Read'}
        </div>
      )}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        style={{
          transform: `translateX(${offset}px)`,
          transition: swiping.current ? 'none' : 'transform 180ms ease-out, opacity 180ms ease-out',
          opacity: leaving !== null ? 0 : 1,
        }}
        className="bg-paper dark:bg-night"
      >
        {children}
      </div>
    </div>
  );
}

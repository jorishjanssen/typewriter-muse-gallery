import { useRef } from 'react';

const TRIGGER_PX = 72;
const ACCENT = '#e04f1f';

/**
 * Horizontal swipe on a feed card toggles its bookmark (save for later).
 * The card snaps back in place afterwards — saving never removes it.
 *
 * Built for smoothness: the gesture lives entirely in refs and paints via
 * requestAnimationFrame by mutating `transform` directly — zero React
 * re-renders while the finger moves. `touch-action: pan-y` hands vertical
 * scrolling to the browser so the two gestures never fight. Movement past
 * the trigger point is damped for a tactile "caught" feel, with a small
 * haptic tick where supported.
 */
export default function SwipeToSave({
  bookmarked,
  onToggle,
  children,
}: {
  bookmarked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const revealRef = useRef<HTMLDivElement | null>(null);
  const g = useRef({
    startX: 0,
    startY: 0,
    dx: 0,
    active: false,
    decided: false,
    engaged: false,
    raf: 0,
  });
  const suppressClick = useRef(false);

  function paint() {
    const s = g.current;
    s.raf = 0;
    const content = contentRef.current;
    const reveal = revealRef.current;
    if (!content || !reveal) return;
    const abs = Math.abs(s.dx);
    const damped = abs > TRIGGER_PX ? TRIGGER_PX + (abs - TRIGGER_PX) * 0.4 : abs;
    content.style.transition = 'none';
    content.style.transform = `translate3d(${Math.sign(s.dx) * damped}px,0,0)`;
    reveal.style.opacity = String(Math.min(1, abs / TRIGGER_PX));
    reveal.style.justifyContent = s.dx > 0 ? 'flex-start' : 'flex-end';
    const engaged = abs >= TRIGGER_PX;
    if (engaged !== s.engaged) {
      s.engaged = engaged;
      reveal.style.color = engaged ? ACCENT : '';
      if (engaged && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(8);
      }
    }
  }

  function schedulePaint() {
    if (!g.current.raf) g.current.raf = requestAnimationFrame(paint);
  }

  function settleBack() {
    const content = contentRef.current;
    const reveal = revealRef.current;
    if (!content || !reveal) return;
    content.style.transition = 'transform 220ms cubic-bezier(0.22, 0.9, 0.3, 1)';
    content.style.transform = 'translate3d(0,0,0)';
    reveal.style.opacity = '0';
    reveal.style.color = '';
  }

  function onTouchStart(e: React.TouchEvent) {
    const s = g.current;
    s.startX = e.touches[0].clientX;
    s.startY = e.touches[0].clientY;
    s.dx = 0;
    s.active = true;
    s.decided = false;
    s.engaged = false;
  }

  function onTouchMove(e: React.TouchEvent) {
    const s = g.current;
    if (!s.active) return;
    const dx = e.touches[0].clientX - s.startX;
    const dy = e.touches[0].clientY - s.startY;
    if (!s.decided) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.4) s.decided = true;
      else if (Math.abs(dy) > 10) {
        s.active = false; // vertical scroll — hands off
        return;
      } else return;
    }
    s.dx = dx;
    schedulePaint();
  }

  function onTouchEnd() {
    const s = g.current;
    if (!s.active) return;
    s.active = false;
    if (!s.decided) return;
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 350);

    if (Math.abs(s.dx) >= TRIGGER_PX) onToggle();
    s.dx = 0;
    settleBack();
  }

  return (
    <div className="relative overflow-hidden">
      <div
        ref={revealRef}
        className="absolute inset-0 flex items-center px-5 text-sm font-semibold text-ink/30 dark:text-snow/30"
        style={{ opacity: 0 }}
        aria-hidden
      >
        {bookmarked ? '✕ Unsave' : '🔖 Save'}
      </div>
      <div
        ref={contentRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        className="bg-paper dark:bg-night will-change-transform [touch-action:pan-y]"
      >
        {children}
      </div>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api';

const TABS = [
  { to: '/', label: 'Feed', match: (p: string) => p === '/' || p.startsWith('/article'), icon: <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" /> },
  { to: '/races', label: 'Peloton', match: (p: string) => p.startsWith('/race') || p.startsWith('/rider'), icon: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></> },
  { to: '/saved', label: 'Saved', match: (p: string) => p.startsWith('/saved'), icon: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /> },
  { to: '/settings', label: 'Settings', match: (p: string) => p.startsWith('/settings'), icon: <><circle cx="12" cy="12" r="3" /><path d="M12 1v4m0 14v4M4.2 4.2l2.8 2.8m10 10 2.8 2.8M1 12h4m14 0h4M4.2 19.8l2.8-2.8m10-10 2.8-2.8" /></> },
];

/** Slides the tab bar away while scrolling down, back on any scroll up. */
function useAutoHide(pathname: string): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      // Always visible near the top (also covers iOS rubber-banding).
      if (y < 80) setHidden(false);
      else if (dy > 6) setHidden(true);
      else if (dy < -6) setHidden(false);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Navigating always brings the bar back.
  useEffect(() => setHidden(false), [pathname]);

  return hidden;
}

/** Thumb-reach navigation: fixed bottom tab bar, safe-area aware. */
export default function TabBar() {
  const { pathname } = useLocation();
  const hidden = useAutoHide(pathname);
  // The unread badge lives here now that there is no header.
  const status = useQuery({ queryKey: ['status'], queryFn: api.status, refetchInterval: 60_000 });
  const unread = status.data?.unread ?? 0;

  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-20 border-t border-ink/10 dark:border-snow/10 bg-paper/95 dark:bg-night/95 backdrop-blur pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ${
        hidden ? 'translate-y-full' : ''
      }`}
    >
      <div className="mx-auto flex max-w-2xl">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.to}
              to={t.to}
              onClick={(e) => {
                // Tapping the tab you're already on scrolls to the top
                // instead of re-navigating.
                if (pathname === t.to) {
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                active ? 'text-accent' : 'opacity-55 hover:opacity-90'
              }`}
            >
              <span className="relative">
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {t.icon}
                </svg>
                {t.to === '/' && unread > 0 && (
                  <span className="absolute -right-3.5 -top-1.5 rounded-full bg-accent text-white px-1.5 py-px text-[9px] font-bold leading-tight">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </span>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

const DISMISS_KEY = 'echappee-race-banner-dismissed';

/**
 * "Watch guide ready" banner after a race day: links to the shielded stage
 * page without leaking anything about how the race went. Dismissal is
 * remembered per race day.
 */
export default function RaceBanner() {
  const banner = useQuery({
    queryKey: ['race-banner'],
    queryFn: api.raceBanner,
    staleTime: 5 * 60_000,
  });
  const [dismissedId, setDismissedId] = useState(() =>
    Number(localStorage.getItem(DISMISS_KEY) ?? 0)
  );

  const b = banner.data;
  if (!b || b.raceId == null || b.raceId === dismissedId) return null;

  return (
    <Link
      to={`/race/${b.raceId}`}
      className="mt-3 flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 group"
    >
      <span className="text-accent" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold group-hover:text-accent transition-colors">
          Watch guide ready — no spoilers
        </span>
        <span className="block text-xs opacity-70 truncate">
          {b.raceName} · {b.stageLabel}
        </span>
      </span>
      <button
        aria-label="Dismiss"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          localStorage.setItem(DISMISS_KEY, String(b.raceId));
          setDismissedId(b.raceId!);
        }}
        className="-m-2 p-2 opacity-50 hover:opacity-100"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </Link>
  );
}

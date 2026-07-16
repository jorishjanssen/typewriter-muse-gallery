import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

const DISMISS_KEY = 'echappee-race-banner-dismissed';

/**
 * Race-day banner — only on the day of the race, in two phases:
 *  - race still on (no watch guide yet): quick route to today's build-up
 *  - watch guide ready: announce it, still zero spoilers
 * Dismissing one phase doesn't hide the other: the guide arriving is news.
 */
export default function RaceBanner() {
  const banner = useQuery({
    queryKey: ['race-banner'],
    queryFn: api.raceBanner,
    staleTime: 5 * 60_000,
  });
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) ?? '');

  const b = banner.data;
  if (!b || b.raceId == null) return null;
  const phase = b.hasGuide ? 'guide' : 'pre';
  const dismissKey = `${b.raceId}:${phase}`;
  if (dismissed === dismissKey) return null;

  return (
    <Link
      to={`/race/${b.raceId}`}
      className="mt-3 flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 group"
    >
      <span className="text-accent" aria-hidden>
        {b.hasGuide ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold group-hover:text-accent transition-colors">
          {b.hasGuide ? 'Watch guide ready — no spoilers' : 'Race today'}
        </span>
        <span className="block text-xs opacity-70 truncate">
          {b.raceName} · {b.stageLabel}
          {!b.hasGuide && ' — build-up & previews'}
        </span>
      </span>
      <button
        aria-label="Dismiss"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          localStorage.setItem(DISMISS_KEY, dismissKey);
          setDismissed(dismissKey);
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

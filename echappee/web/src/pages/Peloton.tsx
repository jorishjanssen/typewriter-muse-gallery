import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type RaceRow } from '../lib/api';

/**
 * Everything around the racing itself: races (with spoiler-free stage pages
 * and watch guides) and riders, behind one segmented control.
 */
export default function Peloton({ initial = 'races' }: { initial?: 'races' | 'riders' }) {
  const [segment, setSegment] = useState<'races' | 'riders'>(initial);

  return (
    <div className="min-h-screen pb-24 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-2xl px-4 py-4">
        <h1 className="font-serif text-2xl font-bold mb-3">Peloton</h1>
        <div className="mb-4 flex rounded-full border border-ink/15 dark:border-snow/20 p-0.5">
          {(['races', 'riders'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSegment(s)}
              className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                segment === s ? 'bg-ink text-paper dark:bg-snow dark:text-night' : 'opacity-60'
              }`}
            >
              {s === 'races' ? 'Races' : 'Riders'}
            </button>
          ))}
        </div>
        {segment === 'races' ? <RacesSection /> : <RidersSection />}
      </div>
    </div>
  );
}

function RacesSection() {
  const races = useQuery({ queryKey: ['races'], queryFn: api.races });

  const groups = new Map<string, RaceRow[]>();
  for (const r of races.data ?? []) {
    const g = groups.get(r.raceName);
    if (g) g.push(r);
    else groups.set(r.raceName, [r]);
  }

  return (
    <>
      <p className="text-sm opacity-60 mb-4">
        Stage pages open spoiler-free: a watch guide first, stories only after you reveal them.
      </p>
      {races.isLoading && <p className="py-10 text-center opacity-60">Loading races…</p>}
      {races.isSuccess && races.data.length === 0 && (
        <p className="py-14 text-center opacity-60">
          No races yet — race days are detected from new articles by the AI pipeline.
        </p>
      )}
      {[...groups.entries()].map(([name, stages]) => (
        <section key={name} className="mb-6">
          <h2 className="font-serif text-lg font-bold mb-1">{name}</h2>
          <ul className="divide-y divide-ink/10 dark:divide-snow/10">
            {stages.map((s) => (
              <li key={s.id}>
                <Link to={`/race/${s.id}`} className="flex items-center gap-3 py-3 group">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold group-hover:text-accent transition-colors">
                      {s.stageLabel}
                    </span>
                    <span className="block text-xs opacity-60">
                      {s.raceDate ?? ''} · {s.articles} {s.articles === 1 ? 'story' : 'stories'}
                    </span>
                  </span>
                  {s.hasGuide && (
                    <span className="rounded-full bg-accent/10 text-accent px-2.5 py-0.5 text-xs font-semibold">
                      ▶ watch guide
                    </span>
                  )}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="opacity-40">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function RidersSection() {
  const [search, setSearch] = useState('');
  const riders = useQuery({ queryKey: ['riders'], queryFn: api.riders });

  const filtered = (riders.data ?? []).filter((r) =>
    r.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search riders…"
        className="w-full rounded-xl border border-ink/15 dark:border-snow/20 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-accent"
      />

      {riders.isLoading && <p className="py-10 text-center opacity-60">Loading riders…</p>}
      {riders.isSuccess && riders.data.length === 0 && (
        <div className="py-14 text-center opacity-60 space-y-2">
          <p className="font-serif text-lg">No riders yet.</p>
          <p className="text-sm">
            Riders are extracted from new articles by the AI pipeline and backfilled for older
            ones over the next few scrapes.
          </p>
        </div>
      )}

      <ul className="mt-2 divide-y divide-ink/10 dark:divide-snow/10">
        {filtered.map((r) => (
          <li key={r.key}>
            <Link
              to={`/rider/${encodeURIComponent(r.key)}?name=${encodeURIComponent(r.name)}`}
              className="flex items-center gap-3 py-3.5 group"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent font-serif font-bold">
                {r.name
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase())
                  .join('')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-serif font-semibold group-hover:text-accent transition-colors">
                  {r.name}
                </span>
                <span className="block text-xs opacity-60">
                  {r.articles} {r.articles === 1 ? 'story' : 'stories'}
                </span>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="opacity-40">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
      {riders.isSuccess && riders.data.length > 0 && filtered.length === 0 && (
        <p className="py-10 text-center text-sm opacity-60">No riders match "{search}".</p>
      )}
    </>
  );
}

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar, { IconButton } from '../components/TopBar';
import { api } from '../lib/api';

export default function Riders() {
  const [search, setSearch] = useState('');
  const riders = useQuery({ queryKey: ['riders'], queryFn: api.riders });

  const filtered = (riders.data ?? []).filter((r) =>
    r.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="min-h-screen pb-24">
      <TopBar
        right={
          <IconButton label="Back to feed" to="/">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M19 12H5m7-7-7 7 7 7" />
            </svg>
          </IconButton>
        }
      />
      <div className="mx-auto max-w-2xl px-4 py-4">
        <h1 className="font-serif text-2xl font-bold mb-3">Riders</h1>
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
      </div>
    </div>
  );
}

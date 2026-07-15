import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type RaceRow } from '../lib/api';

export default function Races() {
  const races = useQuery({ queryKey: ['races'], queryFn: api.races });

  const groups = new Map<string, RaceRow[]>();
  for (const r of races.data ?? []) {
    const g = groups.get(r.raceName);
    if (g) g.push(r);
    else groups.set(r.raceName, [r]);
  }

  return (
    <div className="min-h-screen pb-24 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-2xl px-4 py-4">
        <h1 className="font-serif text-2xl font-bold mb-1">Races</h1>
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
      </div>
    </div>
  );
}

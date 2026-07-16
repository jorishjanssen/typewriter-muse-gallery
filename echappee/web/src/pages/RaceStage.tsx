import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import BackLink from '../components/BackLink';
import InfiniteScroll from '../components/InfiniteScroll';
import StoryCard from '../components/StoryCard';
import { api, type FeedCard } from '../lib/api';
import { useToggleRead } from '../lib/useToggleRead';

/**
 * Stage page with a hard pre/post-race cut: previews and build-up show
 * openly, the watch guide sits in between (or a race-day placeholder while
 * it isn't generated yet), and post-race stories stay behind the reveal.
 */
export default function RaceStage() {
  const { id } = useParams<{ id: string }>();
  const [revealed, setRevealed] = useState(false);

  const race = useQuery({ queryKey: ['race', id], queryFn: () => api.race(id!), enabled: !!id });
  const r = race.data;

  const previews = useInfiniteQuery({
    queryKey: ['feed', 'race', id, 'preview'],
    queryFn: ({ pageParam }) =>
      api.feed({ race: Number(id), raceKind: 'preview', before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: !!id && (r?.previewCount ?? 0) > 0,
  });

  const postRace = useInfiniteQuery({
    queryKey: ['feed', 'race', id, 'post'],
    queryFn: ({ pageParam }) => api.feed({ race: Number(id), raceKind: 'post', before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: !!id && revealed,
  });

  const toggleRead = useToggleRead();
  const handleToggleRead = (card: FeedCard) =>
    toggleRead.mutate({ clusterId: card.clusterId, read: !card.read });

  const previewCards = previews.data?.pages.flatMap((p) => p.cards) ?? [];
  const postCards = postRace.data?.pages.flatMap((p) => p.cards) ?? [];

  return (
    <div className="min-h-screen pb-24 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-2xl px-4 py-2">
        <BackLink label="Races" to="/races" />
        {race.isLoading && <p className="py-10 text-center opacity-60">Loading…</p>}
        {r && (
          <>
            <h1 className="font-serif text-2xl font-bold">{r.raceName}</h1>
            <p className="text-sm opacity-60 mb-4">
              {r.stageLabel}
              {r.raceDate ? ` · ${r.raceDate}` : ''}
            </p>

            {r.previewCount > 0 && (
              <section className="mb-6">
                <h2 className="text-xs font-semibold uppercase tracking-wider opacity-50 mb-1">
                  Before the race
                </h2>
                {previews.isLoading && (
                  <p className="py-4 text-center opacity-60">Loading previews…</p>
                )}
                {previewCards.map((card) => (
                  <StoryCard
                    key={card.clusterId + '-' + card.article.id}
                    card={card}
                    onToggleRead={handleToggleRead}
                  />
                ))}
                <InfiniteScroll
                  hasMore={!!previews.hasNextPage}
                  loading={previews.isFetchingNextPage}
                  onMore={() => void previews.fetchNextPage()}
                />
              </section>
            )}

            {r.guide ? (
              <div className="rounded-2xl border border-accent/25 bg-accent/5 dark:bg-accent/10 p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-accent">▶ When to start watching</span>
                  <span className="ml-auto flex gap-0.5" aria-label={`excitement ${r.guide.excitement} of 5`}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <span
                        key={i}
                        className={`h-2 w-2 rounded-full ${
                          i <= r.guide!.excitement ? 'bg-accent' : 'bg-ink/15 dark:bg-snow/15'
                        }`}
                      />
                    ))}
                  </span>
                </div>
                <p className="text-sm leading-relaxed mb-3">{r.guide.summary}</p>
                <ul className="space-y-2.5">
                  {r.guide.tiers.map((t, i) => (
                    <li key={i} className="flex gap-3 items-baseline">
                      <span className="shrink-0 w-20 text-sm font-bold">
                        {t.minutes === 'full' ? 'Full race' : `~${t.minutes} min`}
                      </span>
                      <span className="text-sm">
                        <span className="font-semibold">from ~{t.fromKm} km to go</span>
                        <span className="opacity-70"> — {t.why}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs opacity-50">
                  Estimated from race reports — treat km marks as approximate. Spoiler-free.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-ink/10 dark:border-snow/15 p-4 mb-6 text-sm opacity-70">
                {r.spoilerCount === 0
                  ? 'No watch guide yet — it appears here shortly after the race finishes.'
                  : "No watch guide yet — it's generated from race reports shortly after they arrive."}
              </div>
            )}

            {r.spoilerCount > 0 &&
              (!revealed ? (
                <button
                  onClick={() => setRevealed(true)}
                  className="w-full rounded-xl bg-ink text-paper dark:bg-snow dark:text-night py-3 text-sm font-semibold"
                >
                  Reveal {r.spoilerCount} post-race {r.spoilerCount === 1 ? 'story' : 'stories'}{' '}
                  (spoilers!)
                </button>
              ) : (
                <section>
                  <h2 className="text-xs font-semibold uppercase tracking-wider opacity-50 mb-1">
                    After the race
                  </h2>
                  {postRace.isLoading && (
                    <p className="py-8 text-center opacity-60">Loading stories…</p>
                  )}
                  {postCards.map((card) => (
                    <StoryCard
                      key={card.clusterId + '-' + card.article.id}
                      card={card}
                      onToggleRead={handleToggleRead}
                    />
                  ))}
                  <InfiniteScroll
                    hasMore={!!postRace.hasNextPage}
                    loading={postRace.isFetchingNextPage}
                    onMore={() => void postRace.fetchNextPage()}
                  />
                </section>
              ))}
            {r.spoilerCount === 0 && r.previewCount === 0 && (
              <p className="py-8 text-center text-sm opacity-60">No stories yet.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

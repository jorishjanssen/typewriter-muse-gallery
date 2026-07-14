import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { SkeletonFeed } from '../components/Skeleton';
import StoryCard from '../components/StoryCard';
import TopBar, { IconButton } from '../components/TopBar';
import { api, CATEGORY_LABELS, type Category } from '../lib/api';

const CHIP_ORDER: (Category | 'all')[] = ['all', 'racing', 'transfers', 'gear', 'offroad', 'other'];

export default function Feed() {
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const queryClient = useQueryClient();

  const status = useQuery({ queryKey: ['status'], queryFn: api.status, refetchInterval: 60_000 });

  const feed = useInfiniteQuery({
    queryKey: ['feed', category, unreadOnly],
    queryFn: ({ pageParam }) =>
      api.feed({
        category: category === 'all' ? undefined : category,
        unread: unreadOnly,
        before: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    // Keep showing the previous list while a filter change fetches, instead
    // of blanking the feed.
    placeholderData: keepPreviousData,
  });

  const cards = feed.data?.pages.flatMap((p) => p.cards) ?? [];

  const refreshAll = async () => {
    await api.refresh();
    setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['status'] });
    }, 4000);
  };

  return (
    <div className="min-h-screen pb-16">
      <TopBar
        unread={status.data?.unread}
        right={
          <>
            <IconButton label="Refresh sources" onClick={() => void refreshAll()}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
              </svg>
            </IconButton>
            <IconButton label="Settings" to="/settings">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </IconButton>
          </>
        }
      />

      <div className="mx-auto max-w-2xl px-4">
        <div className="flex gap-2 overflow-x-auto py-3 -mx-4 px-4 scrollbar-none">
          {CHIP_ORDER.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
                category === c
                  ? 'bg-ink text-paper dark:bg-snow dark:text-night border-transparent'
                  : 'border-ink/15 dark:border-snow/20 opacity-70 hover:opacity-100'
              }`}
            >
              {c === 'all' ? 'All' : CATEGORY_LABELS[c]}
            </button>
          ))}
          <button
            onClick={() => setUnreadOnly((v) => !v)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
              unreadOnly
                ? 'bg-accent text-white border-transparent'
                : 'border-ink/15 dark:border-snow/20 opacity-70 hover:opacity-100'
            }`}
          >
            Unread
          </button>
        </div>

        {feed.isLoading && <SkeletonFeed />}
        {feed.isError && (
          <p className="py-12 text-center opacity-60">
            Could not reach the server — is it running?
          </p>
        )}
        {feed.isSuccess && cards.length === 0 && (
          <div className="py-16 text-center opacity-60 space-y-2">
            <p className="font-serif text-lg">Nothing here yet.</p>
            <p className="text-sm">
              Hit refresh to scrape your sources, or run <code>npm run seed</code> for sample data.
            </p>
          </div>
        )}

        {cards.map((card) => (
          <StoryCard key={card.clusterId + '-' + card.article.id} card={card} />
        ))}

        {feed.hasNextPage && (
          <button
            onClick={() => void feed.fetchNextPage()}
            disabled={feed.isFetchingNextPage}
            className="my-6 w-full rounded-xl border border-ink/15 dark:border-snow/20 py-3 text-sm font-medium opacity-80 hover:opacity-100 disabled:opacity-40"
          >
            {feed.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}

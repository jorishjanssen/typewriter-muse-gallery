import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import PullToRefresh from '../components/PullToRefresh';
import { SkeletonFeed } from '../components/Skeleton';
import StoryCard from '../components/StoryCard';
import TopBar, { IconButton } from '../components/TopBar';
import { api, CATEGORY_LABELS, type Category, type FeedCard, type FeedPage } from '../lib/api';

const CHIP_ORDER: (Category | 'all')[] = ['all', 'racing', 'transfers', 'gear', 'offroad', 'other'];
const SHOW_READ_KEY = 'echappee-show-read';

export default function Feed() {
  const [category, setCategory] = useState<Category | 'all'>('all');
  // Unread is the default view; the preference is remembered per device.
  const [showRead, setShowRead] = useState(() => localStorage.getItem(SHOW_READ_KEY) === '1');
  const [undo, setUndo] = useState<{ clusterId: number; title: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    localStorage.setItem(SHOW_READ_KEY, showRead ? '1' : '0');
  }, [showRead]);

  const status = useQuery({ queryKey: ['status'], queryFn: api.status, refetchInterval: 60_000 });

  const feed = useInfiniteQuery({
    queryKey: ['feed', category, !showRead],
    queryFn: ({ pageParam }) =>
      api.feed({
        category: category === 'all' ? undefined : category,
        unread: !showRead,
        before: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    // Keep showing the previous list while a filter change fetches, instead
    // of blanking the feed.
    placeholderData: keepPreviousData,
  });

  const toggleRead = useMutation({
    mutationFn: ({ clusterId, read }: { clusterId: number; read: boolean }) =>
      read ? api.markClusterRead(clusterId) : api.markClusterUnread(clusterId),
    onMutate: async ({ clusterId, read }) => {
      await queryClient.cancelQueries({ queryKey: ['feed'] });
      const snapshots = queryClient.getQueriesData<InfiniteData<FeedPage>>({ queryKey: ['feed'] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        queryClient.setQueryData(key, {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            cards: p.cards.map((c) =>
              c.clusterId === clusterId
                ? {
                    ...c,
                    read,
                    article: { ...c.article, read },
                    alternates: c.alternates.map((alt) => ({ ...alt, read })),
                  }
                : c
            ),
          })),
        });
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });

  const handleToggleRead = (card: FeedCard) => {
    const read = !card.read;
    toggleRead.mutate({ clusterId: card.clusterId, read });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (read && !showRead) {
      // The card vanishes from the unread view — offer a way back.
      setUndo({ clusterId: card.clusterId, title: card.article.title });
      undoTimer.current = setTimeout(() => setUndo(null), 5000);
    } else {
      setUndo(null);
    }
  };

  const cards = (feed.data?.pages.flatMap((p) => p.cards) ?? []).filter(
    (c) => showRead || !c.read
  );

  const handleRefresh = async () => {
    // Locally this also triggers a scrape; on Vercel scraping is the
    // workflow's job and this fetches whatever it delivered since.
    void api.refresh().catch(() => {});
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['feed'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['status'], type: 'active' }),
    ]);
  };

  return (
    <div className="min-h-screen pb-16">
      <TopBar
        unread={status.data?.unread}
        right={
          <>
            <IconButton label="Settings" to="/settings">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </IconButton>
          </>
        }
      />

      <PullToRefresh onRefresh={handleRefresh}>
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
            onClick={() => setShowRead((v) => !v)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
              showRead
                ? 'bg-accent text-white border-transparent'
                : 'border-ink/15 dark:border-snow/20 opacity-70 hover:opacity-100'
            }`}
          >
            {showRead ? 'Showing read' : 'Show read'}
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
            <p className="font-serif text-lg">
              {showRead ? 'Nothing here yet.' : 'All caught up! 🚴'}
            </p>
            <p className="text-sm">
              {showRead
                ? 'New articles arrive with the next scrape.'
                : 'New articles arrive with the next scrape — or tap "Show read" to revisit.'}
            </p>
          </div>
        )}

        {cards.map((card) => (
          <StoryCard
            key={card.clusterId + '-' + card.article.id}
            card={card}
            onToggleRead={handleToggleRead}
          />
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
      </PullToRefresh>

      {undo && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-full bg-ink text-paper dark:bg-snow dark:text-night pl-4 pr-2 py-2 text-sm shadow-lg">
          <span className="max-w-[50vw] truncate">Marked as read</span>
          <button
            onClick={() => {
              if (undoTimer.current) clearTimeout(undoTimer.current);
              toggleRead.mutate({ clusterId: undo.clusterId, read: false });
              setUndo(null);
            }}
            className="rounded-full bg-accent text-white px-3 py-1 font-semibold"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

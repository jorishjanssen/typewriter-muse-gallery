import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import BriefCard from '../components/BriefCard';
import CatchUp from '../components/CatchUp';
import PullToRefresh from '../components/PullToRefresh';
import { SkeletonFeed } from '../components/Skeleton';
import StoryCard from '../components/StoryCard';
import TopBar from '../components/TopBar';
import { api, CATEGORY_LABELS, type Category, type FeedCard } from '../lib/api';
import { useToggleRead } from '../lib/useToggleRead';

const CHIP_ORDER: (Category | 'all')[] = ['all', 'racing', 'transfers', 'gear', 'offroad', 'other'];
const SHOW_READ_KEY = 'echappee-show-read';
const VIEW_KEY = 'echappee-view';

export default function Feed() {
  const [category, setCategory] = useState<Category | 'all'>('all');
  // Unread is the default view; the preference is remembered per device.
  const [showRead, setShowRead] = useState(() => localStorage.getItem(SHOW_READ_KEY) === '1');
  const [view, setView] = useState<'cards' | 'briefs'>(() =>
    localStorage.getItem(VIEW_KEY) === 'briefs' ? 'briefs' : 'cards'
  );
  const [undo, setUndo] = useState<{ clusterId: number; title: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    localStorage.setItem(SHOW_READ_KEY, showRead ? '1' : '0');
  }, [showRead]);

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view);
  }, [view]);

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

  const toggleRead = useToggleRead();

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
    <div className="min-h-screen pb-24">
      <TopBar unread={status.data?.unread} />

      <PullToRefresh onRefresh={handleRefresh}>
      <div className="mx-auto max-w-2xl px-4">
        <CatchUp />
        <div className="flex gap-2 overflow-x-auto py-3 -mx-4 px-4 scrollbar-none">
          <div className="flex shrink-0 rounded-full border border-ink/15 dark:border-snow/20 p-0.5">
            {(['cards', 'briefs'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  view === v ? 'bg-ink text-paper dark:bg-snow dark:text-night' : 'opacity-60'
                }`}
              >
                {v === 'cards' ? 'Articles' : 'Briefs'}
              </button>
            ))}
          </div>
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

        {cards.map((card) =>
          view === 'briefs' ? (
            <BriefCard
              key={card.clusterId + '-' + card.article.id}
              card={card}
              onToggleRead={handleToggleRead}
            />
          ) : (
            <StoryCard
              key={card.clusterId + '-' + card.article.id}
              card={card}
              onToggleRead={handleToggleRead}
            />
          )
        )}

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
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-full bg-ink text-paper dark:bg-snow dark:text-night pl-4 pr-2 py-2 text-sm shadow-lg">
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

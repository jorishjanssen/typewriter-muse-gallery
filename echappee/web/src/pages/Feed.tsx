import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import ActionSheet from '../components/ActionSheet';
import BriefCard from '../components/BriefCard';
import InfiniteScroll from '../components/InfiniteScroll';
import PullToRefresh from '../components/PullToRefresh';
import { SkeletonFeed } from '../components/Skeleton';
import { api, CATEGORY_LABELS, type Category, type FeedCard } from '../lib/api';
import { useToggleBookmark } from '../lib/useToggleBookmark';
import { useToggleRead } from '../lib/useToggleRead';

// The only two topics worth a dedicated chip; tapping the active one clears it.
const FILTER_CHIPS: Category[] = ['racing', 'gear'];
// "New since your last visit" line. A visit ends after 30 minutes of
// inactivity; the marker then remembers where the previous visit left off.
const LAST_SEEN_KEY = 'echappee-last-seen-at';
const NEW_SINCE_KEY = 'echappee-new-since';
const VISIT_GAP_MS = 30 * 60_000;

/** Rolls the visit marker forward when a new visit starts; returns the marker (ms). */
function trackVisit(): number | null {
  const now = Date.now();
  const lastSeen = Number(localStorage.getItem(LAST_SEEN_KEY) ?? 0);
  if (lastSeen && now - lastSeen > VISIT_GAP_MS) {
    localStorage.setItem(NEW_SINCE_KEY, String(lastSeen));
  }
  localStorage.setItem(LAST_SEEN_KEY, String(now));
  const marker = Number(localStorage.getItem(NEW_SINCE_KEY) ?? 0);
  return marker || null;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Marks a story as seen once it has been scrolled past (left the top of the viewport). */
function AutoSeen({
  enabled,
  onSeen,
  children,
}: {
  enabled: boolean;
  onSeen: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const done = useRef(false);
  const cb = useRef(onSeen);
  cb.current = onSeen;

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const io = new IntersectionObserver(([entry]) => {
      const above =
        !entry.isIntersecting &&
        entry.boundingClientRect.bottom < (entry.rootBounds?.top ?? 0) + 1;
      if (above && !done.current) {
        done.current = true;
        cb.current();
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);

  return <div ref={ref}>{children}</div>;
}

export default function Feed() {
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [raceOnly, setRaceOnly] = useState(false);
  // Captured once per mount: where the previous visit ended.
  const [newSince] = useState(trackVisit);
  const [sheetCard, setSheetCard] = useState<FeedCard | null>(null);
  const queryClient = useQueryClient();

  // Keep the activity timestamp fresh while the feed stays open, so a long
  // reading session doesn't count as several visits.
  useEffect(() => {
    const iv = setInterval(() => localStorage.setItem(LAST_SEEN_KEY, String(Date.now())), 60_000);
    return () => clearInterval(iv);
  }, []);

  // Today's race (if any) powers the leftmost filter chip.
  const raceToday = useQuery({
    queryKey: ['race-banner'],
    queryFn: api.raceBanner,
    staleTime: 5 * 60_000,
  });
  const todayRaceId = raceToday.data?.raceId ?? null;

  const feed = useInfiniteQuery({
    queryKey: ['feed', category, raceOnly ? todayRaceId : null],
    queryFn: ({ pageParam }) =>
      api.feed({
        category: category === 'all' ? undefined : category,
        race: raceOnly && todayRaceId ? todayRaceId : undefined,
        before: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    // Keep showing the previous list while a filter change fetches, instead
    // of blanking the feed.
    placeholderData: keepPreviousData,
  });

  const toggleRead = useToggleRead();
  const toggleBookmark = useToggleBookmark();

  const muteSource = useMutation({
    mutationFn: (sourceKey: string) => api.addMute('source', sourceKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['mutes'] });
      void queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });

  // Liking straight from the feed — briefs are the primary reading surface,
  // so the taste signal must not require opening the article.
  const likeStory = useMutation({
    mutationFn: ({ articleId, liked }: { articleId: number; liked: boolean }) =>
      liked ? api.like(articleId) : api.unlike(articleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
    },
  });

  // Cards never vanish from the single feed — toggling just flips the dot in
  // place, so no undo toast is needed.
  const handleToggleRead = (card: FeedCard) => {
    toggleRead.mutate({ clusterId: card.clusterId, read: !card.read });
  };

  const handleAutoSeen = (card: FeedCard) => {
    if (!card.read) toggleRead.mutate({ clusterId: card.clusterId, read: true });
  };

  const handleToggleBookmark = (card: FeedCard) => {
    toggleBookmark.mutate({ clusterId: card.clusterId, bookmarked: !card.bookmarked });
  };

  const cards = feed.data?.pages.flatMap((p) => p.cards) ?? [];

  const handleRefresh = async () => {
    // Locally this also triggers a scrape; on Vercel scraping is the
    // workflow's job and this fetches whatever it delivered since.
    void api.refresh().catch(() => {});
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['feed'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['status'], type: 'active' }),
    ]);
  };

  // One entry per source on the long-pressed card.
  const sheetSources = sheetCard
    ? [sheetCard.article, ...sheetCard.alternates].filter(
        (a, i, arr) => arr.findIndex((x) => x.sourceKey === a.sourceKey) === i
      )
    : [];

  // Assemble the brief stream: the new-since-last-visit line, day dividers,
  // a pull-quote at most every other brief, and each story's own photo at
  // most every third brief.
  const stream: React.ReactNode[] = [];
  let lastDay = '';
  let sinceQuote = 2;
  let sincePhoto = 2;
  let newSincePending = newSince !== null;

  cards.forEach((card, i) => {
    // Divider by the same timestamp that positions the card (its newest
    // coverage), not the displayed article — those can differ by a day.
    const time = card.latestPublishedAt ?? card.article.publishedAt;
    if (newSincePending && newSince !== null && Date.parse(time) <= newSince) {
      // The boundary between this visit's arrivals and everything older. At
      // the very top it says outright that nothing new came in.
      stream.push(
        <div key="new-since" className="flex items-center gap-3 py-2" role="separator">
          <span className="h-px flex-1 bg-accent/40" />
          <span className="text-xs font-semibold text-accent">
            {i === 0 ? 'Nothing new since your last visit' : 'New since your last visit'}
          </span>
          <span className="h-px flex-1 bg-accent/40" />
        </div>
      );
      newSincePending = false;
    }
    const day = dayLabel(time);
    if (day !== lastDay) {
      stream.push(
        <div
          key={`day-${day}`}
          className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wider opacity-50"
        >
          {day}
        </div>
      );
      lastDay = day;
    }

    const hasQuote = [card.article, ...card.alternates].some((a) => a.quote);
    const showQuote = hasQuote && sinceQuote >= 2;
    sinceQuote = showQuote ? 0 : sinceQuote + 1;
    const hasPhoto = [card.article, ...card.alternates].some((a) => a.imageUrl);
    const showPhoto = hasPhoto && sincePhoto >= 2;
    sincePhoto = showPhoto ? 0 : sincePhoto + 1;
    stream.push(
      <div key={card.clusterId + '-' + card.article.id}>
        <AutoSeen enabled onSeen={() => handleAutoSeen(card)}>
          <BriefCard
            card={card}
            onToggleRead={handleToggleRead}
            onToggleBookmark={handleToggleBookmark}
            onLongPress={setSheetCard}
            showQuote={showQuote}
            showPhoto={showPhoto}
          />
        </AutoSeen>
      </div>
    );
  });

  return (
    <div className="min-h-screen pb-24 pt-[env(safe-area-inset-top)]">
      <PullToRefresh onRefresh={handleRefresh}>
      <div className="mx-auto max-w-2xl px-4">
        <div className="flex gap-2 overflow-x-auto py-3 -mx-4 px-4 scrollbar-none">
          {todayRaceId !== null && (
            <button
              onClick={() => setRaceOnly((v) => !v)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
                raceOnly
                  ? 'bg-accent text-white border-transparent'
                  : 'border-accent/40 text-accent hover:bg-accent/10'
              }`}
            >
              🏁 Today's race
            </button>
          )}
          {FILTER_CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(category === c ? 'all' : c)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
                category === c
                  ? 'bg-ink text-paper dark:bg-snow dark:text-night border-transparent'
                  : 'border-ink/15 dark:border-snow/20 opacity-70 hover:opacity-100'
              }`}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
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
            <p className="text-sm">New articles arrive with the next scrape.</p>
          </div>
        )}

        {stream}

        <InfiniteScroll
          hasMore={!!feed.hasNextPage}
          loading={feed.isFetchingNextPage}
          onMore={() => void feed.fetchNextPage()}
        />
      </div>
      </PullToRefresh>

      <ActionSheet
        open={!!sheetCard}
        title={sheetCard?.article.title}
        onClose={() => setSheetCard(null)}
        actions={
          sheetCard
            ? [
                {
                  label: sheetCard.bookmarked ? 'Remove from saved' : '🔖 Save for later',
                  onClick: () => handleToggleBookmark(sheetCard),
                },
                {
                  label: sheetCard.article.liked ? 'Remove thumbs-up' : '👍 Good read',
                  onClick: () =>
                    likeStory.mutate({
                      articleId: sheetCard.article.id,
                      liked: !sheetCard.article.liked,
                    }),
                },
                {
                  label: sheetCard.read ? 'Mark as new' : 'Mark as seen',
                  onClick: () => handleToggleRead(sheetCard),
                },
                ...sheetSources.map((a) => ({
                  label: `Mute ${a.sourceName}`,
                  destructive: true,
                  onClick: () => muteSource.mutate(a.sourceKey),
                })),
              ]
            : []
        }
      />

    </div>
  );
}

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ActionSheet from '../components/ActionSheet';
import BriefCard from '../components/BriefCard';
import InfiniteScroll from '../components/InfiniteScroll';
import PullToRefresh from '../components/PullToRefresh';
import RaceBanner from '../components/RaceBanner';
import { SkeletonFeed } from '../components/Skeleton';
import { api, CATEGORY_LABELS, type Category, type FeedCard } from '../lib/api';
import { useToggleRead } from '../lib/useToggleRead';

const CHIP_ORDER: (Category | 'all')[] = ['all', 'racing', 'transfers', 'gear', 'offroad', 'other'];
const SHOW_ALL_KEY = 'echappee-show-read';
// Scroll-past-marks-seen. On unless explicitly disabled.
const AUTOSEEN_KEY = 'echappee-autoseen';
// "New since your last visit" line (All view). A visit ends after 30 minutes
// of inactivity; the marker then remembers where the previous visit left off.
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

/** A photo from one of the surrounding stories, to break up the text wall. */
function PhotoBreak({ card }: { card: FeedCard }) {
  const a = card.article;
  return (
    <Link to={`/article/${a.id}`} className="block my-4 group">
      <img
        src={a.imageUrl!}
        alt=""
        loading="lazy"
        className="w-full aspect-[16/9] rounded-2xl object-cover"
      />
      <span className="mt-1.5 block text-xs opacity-60 line-clamp-1 group-hover:opacity-90">
        {a.title} · {a.sourceName}
      </span>
    </Link>
  );
}

export default function Feed() {
  const [category, setCategory] = useState<Category | 'all'>('all');
  // Unread is the default view; the preference is remembered per device.
  const [showAll, setShowAll] = useState(() => localStorage.getItem(SHOW_ALL_KEY) === '1');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [raceOnly, setRaceOnly] = useState(false);
  const [raceBlockOpen, setRaceBlockOpen] = useState(false);
  // Captured once per mount: where the previous visit ended.
  const [newSince] = useState(trackVisit);
  const autoSeen = localStorage.getItem(AUTOSEEN_KEY) !== '0';
  const [undo, setUndo] = useState<{ clusterId: number; title: string } | null>(null);
  const [sheetCard, setSheetCard] = useState<FeedCard | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stories auto-marked seen this session stay visible instead of vanishing
  // mid-scroll like a manual swipe does.
  const autoRead = useRef(new Set<number>());
  const queryClient = useQueryClient();

  useEffect(() => {
    localStorage.setItem(SHOW_ALL_KEY, showAll ? '1' : '0');
  }, [showAll]);

  // Keep the activity timestamp fresh while the feed stays open, so a long
  // reading session doesn't count as several visits.
  useEffect(() => {
    const iv = setInterval(() => localStorage.setItem(LAST_SEEN_KEY, String(Date.now())), 60_000);
    return () => clearInterval(iv);
  }, []);

  // Today's race (if any) powers the leftmost filter chip; the RaceBanner
  // component shares this cached query.
  const raceToday = useQuery({
    queryKey: ['race-banner'],
    queryFn: api.raceBanner,
    staleTime: 5 * 60_000,
  });
  const todayRaceId = raceToday.data?.raceId ?? null;

  const feed = useInfiniteQuery({
    queryKey: ['feed', category, !showAll, raceOnly ? todayRaceId : null],
    queryFn: ({ pageParam }) =>
      api.feed({
        category: category === 'all' ? undefined : category,
        race: raceOnly && todayRaceId ? todayRaceId : undefined,
        unread: !showAll,
        before: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    // Keep showing the previous list while a filter change fetches, instead
    // of blanking the feed.
    placeholderData: keepPreviousData,
  });

  const toggleRead = useToggleRead();

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

  const handleToggleRead = (card: FeedCard) => {
    const read = !card.read;
    toggleRead.mutate({ clusterId: card.clusterId, read });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (read && !showAll) {
      // The card vanishes from the unread view — offer a way back.
      setUndo({ clusterId: card.clusterId, title: card.article.title });
      undoTimer.current = setTimeout(() => setUndo(null), 5000);
    } else {
      setUndo(null);
    }
  };

  const handleAutoSeen = (card: FeedCard) => {
    if (card.read || autoRead.current.has(card.clusterId)) return;
    autoRead.current.add(card.clusterId);
    toggleRead.mutate({ clusterId: card.clusterId, read: true });
  };

  const cards = (feed.data?.pages.flatMap((p) => p.cards) ?? []).filter(
    (c) => showAll || !c.read || autoRead.current.has(c.clusterId)
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

  // One entry per source on the long-pressed card.
  const sheetSources = sheetCard
    ? [sheetCard.article, ...sheetCard.alternates].filter(
        (a, i, arr) => arr.findIndex((x) => x.sourceKey === a.sourceKey) === i
      )
    : [];

  // Race-day calm: while there's a race today, its live coverage folds into
  // one expandable block anchored where the newest of those stories sits.
  // The 🏁 filter is the "show me everything about the race" path, so no
  // collapsing there; small trickles (1–2 stories) also stay inline.
  const raceCards =
    todayRaceId !== null && !raceOnly ? cards.filter((c) => c.raceId === todayRaceId) : [];
  const collapseRace = raceCards.length >= 3;
  const raceLabel =
    [raceToday.data?.raceName, raceToday.data?.stageLabel].filter(Boolean).join(' · ') ||
    "today's race";

  const items: { card: FeedCard; raceBlock?: FeedCard[] }[] = [];
  for (const card of cards) {
    if (collapseRace && card.raceId === todayRaceId) {
      // The newest race story carries the whole block; the rest fold in.
      if (card === raceCards[0]) items.push({ card, raceBlock: raceCards });
    } else {
      items.push({ card });
    }
  }

  // Assemble the brief stream: day dividers, the new-since-last-visit line
  // (All view), a pull-quote at most every other brief, and a photo break
  // every 4 briefs (image borrowed from a nearby story, each used once).
  const stream: React.ReactNode[] = [];
  let lastDay = '';
  let sinceQuote = 2;
  let sincePhoto = 0;
  const usedPhotos = new Set<number>();
  const photoPool: FeedCard[] = [];
  let newSincePending = showAll && newSince !== null;

  const renderCard = (card: FeedCard) => {
    const hasQuote = [card.article, ...card.alternates].some((a) => a.quote);
    const showQuote = hasQuote && sinceQuote >= 2;
    sinceQuote = showQuote ? 0 : sinceQuote + 1;
    return (
      <div key={card.clusterId + '-' + card.article.id}>
        <AutoSeen enabled={autoSeen && !showAll} onSeen={() => handleAutoSeen(card)}>
          <BriefCard
            card={card}
            onToggleRead={handleToggleRead}
            onLongPress={setSheetCard}
            showQuote={showQuote}
          />
        </AutoSeen>
      </div>
    );
  };

  items.forEach((item, i) => {
    // Divider by the same timestamp that positions the card (its newest
    // coverage), not the displayed article — those can differ by a day.
    const time = item.card.latestPublishedAt ?? item.card.article.publishedAt;
    if (newSincePending && newSince !== null && Date.parse(time) <= newSince) {
      // The boundary between this visit's arrivals and everything older —
      // only drawn when it falls inside the list (something new above it).
      if (i > 0) {
        stream.push(
          <div key="new-since" className="flex items-center gap-3 py-2" role="separator">
            <span className="h-px flex-1 bg-accent/40" />
            <span className="text-xs font-semibold text-accent">New since your last visit</span>
            <span className="h-px flex-1 bg-accent/40" />
          </div>
        );
      }
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

    if (item.raceBlock) {
      const newCount = item.raceBlock.filter((c) => !c.read).length;
      stream.push(
        <div
          key={`race-block-${todayRaceId}`}
          className="my-3 rounded-2xl border border-accent/25 bg-accent/5 dark:bg-accent/10"
        >
          <button
            onClick={() => setRaceBlockOpen((v) => !v)}
            aria-expanded={raceBlockOpen}
            className="flex w-full items-center gap-2 px-4 py-3 text-sm"
          >
            <span aria-hidden>🏁</span>
            <span className="min-w-0 truncate text-left font-semibold">
              {item.raceBlock.length} stories about {raceLabel}
            </span>
            {!raceBlockOpen && newCount > 0 && (
              <span className="shrink-0 rounded-full bg-accent px-2 py-px text-xs font-semibold text-white">
                {newCount} new
              </span>
            )}
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
              className={`ml-auto shrink-0 opacity-50 transition-transform ${raceBlockOpen ? 'rotate-180' : ''}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {raceBlockOpen && <div className="px-4 pb-1">{item.raceBlock.map(renderCard)}</div>}
        </div>
      );
      return;
    }

    stream.push(renderCard(item.card));
    photoPool.push(item.card);
    sincePhoto += 1;
    if (sincePhoto >= 4) {
      const photoCard = photoPool
        .slice(-4)
        .find((c) => c.article.imageUrl && !usedPhotos.has(c.article.id));
      if (photoCard) {
        usedPhotos.add(photoCard.article.id);
        stream.push(<PhotoBreak key={`photo-${photoCard.article.id}`} card={photoCard} />);
      }
      sincePhoto = 0;
    }
  });

  return (
    <div className="min-h-screen pb-24 pt-[env(safe-area-inset-top)]">
      <PullToRefresh onRefresh={handleRefresh}>
      <div className="mx-auto max-w-2xl px-4">
        <RaceBanner />
        <div className="flex gap-2 overflow-x-auto py-3 -mx-4 px-4 scrollbar-none">
          <div className="flex shrink-0 rounded-full border border-ink/15 dark:border-snow/20 p-0.5">
            {([false, true] as const).map((all) => (
              <button
                key={String(all)}
                onClick={() => setShowAll(all)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  showAll === all ? 'bg-ink text-paper dark:bg-snow dark:text-night' : 'opacity-60'
                }`}
              >
                {all ? 'All' : 'New'}
              </button>
            ))}
          </div>
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
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
              category !== 'all'
                ? 'bg-ink text-paper dark:bg-snow dark:text-night border-transparent'
                : 'border-ink/15 dark:border-snow/20 opacity-70 hover:opacity-100'
            }`}
          >
            {category === 'all' ? 'Filter' : CATEGORY_LABELS[category]} {filtersOpen ? '▴' : '▾'}
          </button>
        </div>
        {filtersOpen && (
          <div className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-none">
            {CHIP_ORDER.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCategory(c);
                  setFiltersOpen(false);
                }}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
                  category === c
                    ? 'bg-ink text-paper dark:bg-snow dark:text-night border-transparent'
                    : 'border-ink/15 dark:border-snow/20 opacity-70 hover:opacity-100'
                }`}
              >
                {c === 'all' ? 'All topics' : CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        )}

        {feed.isLoading && <SkeletonFeed />}
        {feed.isError && (
          <p className="py-12 text-center opacity-60">
            Could not reach the server — is it running?
          </p>
        )}
        {feed.isSuccess && cards.length === 0 && (
          <div className="py-16 text-center opacity-60 space-y-2">
            <p className="font-serif text-lg">
              {showAll ? 'Nothing here yet.' : 'All caught up! 🚴'}
            </p>
            <p className="text-sm">
              {showAll
                ? 'New articles arrive with the next scrape.'
                : 'New stories arrive with the next scrape — flip to "All" to look back.'}
            </p>
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

      {undo && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-full bg-ink text-paper dark:bg-snow dark:text-night pl-4 pr-2 py-2 text-sm shadow-lg">
          <span className="max-w-[50vw] truncate">Seen</span>
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

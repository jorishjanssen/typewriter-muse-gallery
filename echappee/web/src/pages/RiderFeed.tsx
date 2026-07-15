import { useInfiniteQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { SkeletonFeed } from '../components/Skeleton';
import StoryCard from '../components/StoryCard';
import TopBar, { IconButton } from '../components/TopBar';
import { api, type FeedCard } from '../lib/api';
import { useToggleRead } from '../lib/useToggleRead';

/** Every story about one rider — read and unread alike. */
export default function RiderFeed() {
  const { key } = useParams<{ key: string }>();
  const [params] = useSearchParams();
  const name = params.get('name') ?? key ?? '';

  const feed = useInfiniteQuery({
    queryKey: ['feed', 'rider', key],
    queryFn: ({ pageParam }) => api.feed({ rider: key, before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: !!key,
  });

  const toggleRead = useToggleRead();
  const handleToggleRead = (card: FeedCard) =>
    toggleRead.mutate({ clusterId: card.clusterId, read: !card.read });

  const cards = feed.data?.pages.flatMap((p) => p.cards) ?? [];

  return (
    <div className="min-h-screen pb-16">
      <TopBar
        right={
          <IconButton label="Back to riders" to="/riders">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M19 12H5m7-7-7 7 7 7" />
            </svg>
          </IconButton>
        }
      />
      <div className="mx-auto max-w-2xl px-4 py-4">
        <h1 className="font-serif text-2xl font-bold">{name}</h1>
        <p className="text-sm opacity-60 mb-2">
          {feed.isSuccess ? `${cards.length}${feed.hasNextPage ? '+' : ''} stories` : 'All stories'}
        </p>

        {feed.isLoading && <SkeletonFeed />}
        {feed.isError && (
          <p className="py-12 text-center opacity-60">Could not reach the server.</p>
        )}
        {feed.isSuccess && cards.length === 0 && (
          <p className="py-14 text-center opacity-60">No stories for this rider yet.</p>
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
    </div>
  );
}

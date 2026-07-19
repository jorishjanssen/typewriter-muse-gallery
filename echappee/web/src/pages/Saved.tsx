import { useQuery } from '@tanstack/react-query';
import BriefCard from '../components/BriefCard';
import { api, type FeedCard } from '../lib/api';
import { useToggleBookmark } from '../lib/useToggleBookmark';
import { useToggleRead } from '../lib/useToggleRead';

/** Read-later list: every story saved by swiping a brief, newest save first. */
export default function Saved() {
  const saved = useQuery({ queryKey: ['bookmarks'], queryFn: api.bookmarks });
  const toggleBookmark = useToggleBookmark();
  const toggleRead = useToggleRead();

  const handleToggleBookmark = (card: FeedCard) => {
    toggleBookmark.mutate({ clusterId: card.clusterId, bookmarked: !card.bookmarked });
  };

  const cards = saved.data?.cards ?? [];

  return (
    <div className="min-h-screen pb-24 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-2xl px-4 py-4">
        <h1 className="font-serif text-2xl font-bold mb-1">Saved</h1>
        <p className="text-sm opacity-60 mb-2">Swipe a story here or in the feed to unsave it.</p>

        {saved.isLoading && <p className="py-10 text-center opacity-60">Loading…</p>}
        {saved.isError && (
          <p className="py-12 text-center opacity-60">Could not reach the server.</p>
        )}
        {saved.isSuccess && cards.length === 0 && (
          <div className="py-16 text-center opacity-60 space-y-2">
            <p className="font-serif text-lg">Nothing saved yet.</p>
            <p className="text-sm">Swipe a brief in the feed to keep it here for later.</p>
          </div>
        )}

        {cards.map((card) => (
          <BriefCard
            key={card.clusterId + '-' + card.article.id}
            card={card}
            onToggleRead={(c) => toggleRead.mutate({ clusterId: c.clusterId, read: !c.read })}
            onToggleBookmark={handleToggleBookmark}
            showPhoto={!!card.article.imageUrl || card.alternates.some((a) => a.imageUrl)}
          />
        ))}
      </div>
    </div>
  );
}

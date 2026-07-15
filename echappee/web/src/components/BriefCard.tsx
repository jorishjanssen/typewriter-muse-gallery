import { Link } from 'react-router-dom';
import { timeAgo, type FeedCard } from '../lib/api';
import { useLongPress } from '../lib/useLongPress';
import SwipeToRead from './SwipeToRead';

/** Compact, Twitter-style rendering of a story: the news itself in ~360 chars. */
export default function BriefCard({
  card,
  onToggleRead,
  onLongPress,
}: {
  card: FeedCard;
  onToggleRead: (card: FeedCard) => void;
  onLongPress?: (card: FeedCard) => void;
}) {
  const a = card.article;
  // A multi-source story shows the merged brief covering every outlet's
  // coverage; single-source stories use the article's own brief.
  const text = card.clusterBrief ?? a.brief ?? a.summary ?? a.excerpt ?? a.title;
  const longPress = useLongPress(() => onLongPress?.(card));
  return (
    <SwipeToRead read={card.read} onToggle={() => onToggleRead(card)}>
      <article
        {...(onLongPress ? longPress : {})}
        className={`py-3.5 border-b border-ink/10 dark:border-snow/10 transition-opacity ${
          card.read ? 'opacity-45' : ''
        }`}
      >
        <Link to={`/article/${a.id}`} className="block group">
          <div className="flex items-center gap-2 text-xs mb-1">
            <span className="font-semibold opacity-70">{a.sourceName}</span>
            <span className="opacity-50">·</span>
            <time className="opacity-60">{timeAgo(a.publishedAt)}</time>
            {card.alternates.length > 0 && (
              <span className="rounded-full bg-accent/10 text-accent px-2 py-px font-semibold">
                +{card.alternates.length}
              </span>
            )}
            <button
              aria-label={card.read ? 'Mark as unread' : 'Mark as read'}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleRead(card);
              }}
              className="ml-auto -m-2 p-2"
            >
              <span
                className={`block h-2.5 w-2.5 rounded-full transition-colors ${
                  card.read ? 'border-2 border-ink/25 dark:border-snow/25' : 'bg-accent'
                }`}
              />
            </button>
          </div>
          <p className="text-[0.95rem] leading-relaxed">
            {text}
            <span className="ml-2 text-xs text-accent opacity-80 group-hover:opacity-100 whitespace-nowrap">
              read more{a.readingMinutes ? ` · ${a.readingMinutes} min` : ''} →
            </span>
          </p>
        </Link>
      </article>
    </SwipeToRead>
  );
}

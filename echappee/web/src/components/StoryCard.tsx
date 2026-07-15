import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORY_LABELS, timeAgo, type FeedCard } from '../lib/api';
import { useLongPress } from '../lib/useLongPress';
import SwipeToRead from './SwipeToRead';

const CATEGORY_COLORS: Record<string, string> = {
  racing: 'text-accent',
  transfers: 'text-sky-600 dark:text-sky-400',
  gear: 'text-emerald-700 dark:text-emerald-400',
  offroad: 'text-amber-700 dark:text-amber-400',
  other: 'text-ink/50 dark:text-snow/50',
};

export default function StoryCard({
  card,
  onToggleRead,
  onLongPress,
}: {
  card: FeedCard;
  onToggleRead: (card: FeedCard) => void;
  onLongPress?: (card: FeedCard) => void;
}) {
  const a = card.article;
  const grouped = card.alternates.length > 0;
  const [expanded, setExpanded] = useState(false);
  const longPress = useLongPress(() => onLongPress?.(card));

  return (
    <SwipeToRead read={card.read} onToggle={() => onToggleRead(card)}>
      <article
        {...(onLongPress ? longPress : {})}
        className={`transition-opacity ${card.read ? 'opacity-45' : ''} ${
          grouped
            ? 'my-3 rounded-2xl border border-accent/25 bg-accent/5 dark:bg-accent/10 px-4 py-4'
            : 'py-4 border-b border-ink/10 dark:border-snow/10'
        }`}
      >
        <Link to={`/article/${a.id}`} className="block group">
          <div className="flex items-center gap-2 text-xs mb-1.5">
            <span className={`font-semibold uppercase tracking-wide ${CATEGORY_COLORS[a.category]}`}>
              {CATEGORY_LABELS[a.category]}
            </span>
            <span className="opacity-50">·</span>
            <span className="opacity-60">{a.sourceName}</span>
            <span className="opacity-50">·</span>
            <time className="opacity-60">{timeAgo(a.publishedAt)}</time>
            {a.readingMinutes && (
              <>
                <span className="opacity-50">·</span>
                <span className="opacity-60 whitespace-nowrap">{a.readingMinutes} min</span>
              </>
            )}
            <button
              aria-label={card.read ? 'Mark as unread' : 'Mark as read'}
              title={card.read ? 'Mark as unread' : 'Mark as read'}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleRead(card);
              }}
              className="ml-auto -m-2 p-2"
            >
              <span
                className={`block h-3 w-3 rounded-full transition-colors ${
                  card.read ? 'border-2 border-ink/25 dark:border-snow/25' : 'bg-accent'
                }`}
              />
            </button>
          </div>
          <div className="flex gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-lg font-bold leading-snug group-hover:text-accent transition-colors">
                {a.title}
              </h2>
              {(a.summary ?? a.excerpt) && (
                <p className="mt-1 text-sm leading-relaxed opacity-75 line-clamp-3">
                  {a.summary ?? a.excerpt}
                </p>
              )}
            </div>
            {a.imageUrl && (
              <img
                src={a.imageUrl}
                alt=""
                loading="lazy"
                className="h-20 w-20 shrink-0 rounded-xl object-cover"
              />
            )}
          </div>
        </Link>

        {grouped && (
          <>
            <button
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-3 flex w-full items-center gap-1.5 text-xs"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0">
                <path d="M12 2 2 7l10 5 10-5-10-5zM2 12l10 5 10-5M2 17l10 5 10-5" />
              </svg>
              <span className="font-semibold text-accent">
                {card.alternates.length + 1} sources
              </span>
              <span className="opacity-60 truncate">
                · {card.alternates.map((alt) => alt.sourceName).join(' · ')}
              </span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
                className={`ml-auto shrink-0 opacity-50 transition-transform ${expanded ? 'rotate-180' : ''}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {expanded && (
              <ul className="mt-2.5 space-y-2.5 border-l-2 border-accent/30 pl-3">
                {card.alternates.map((alt) => (
                  <li key={alt.id}>
                    <Link to={`/article/${alt.id}`} className="block group/alt">
                      <span className="text-xs opacity-60">
                        {alt.sourceName} · {timeAgo(alt.publishedAt)}
                      </span>
                      <span className="block text-sm font-serif font-semibold leading-snug group-hover/alt:text-accent transition-colors">
                        {alt.title}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </article>
    </SwipeToRead>
  );
}

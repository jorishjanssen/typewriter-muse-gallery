import { useState } from 'react';
import { Link } from 'react-router-dom';
import { timeAgo, type ArticleCard, type FeedCard } from '../lib/api';
import { useLongPress } from '../lib/useLongPress';
import SwipeToRead from './SwipeToRead';

/**
 * Compact, Twitter-style rendering of a story: the news itself in ~360
 * chars. Multi-source stories get a tappable sources drawer; a pull-quote
 * shows when the feed decides this card may carry one.
 */
export default function BriefCard({
  card,
  onToggleRead,
  onLongPress,
  showQuote = false,
}: {
  card: FeedCard;
  onToggleRead: (card: FeedCard) => void;
  onLongPress?: (card: FeedCard) => void;
  showQuote?: boolean;
}) {
  const a = card.article;
  const text = card.clusterBrief ?? a.brief ?? a.summary ?? a.excerpt ?? a.title;
  const longPress = useLongPress(() => onLongPress?.(card));
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const quote = showQuote
    ? ([a, ...card.alternates].find((x) => x.quote)?.quote ?? null)
    : null;
  const sources: ArticleCard[] = [a, ...card.alternates];

  return (
    <SwipeToRead read={card.read} onToggle={() => onToggleRead(card)}>
      <article
        {...(onLongPress ? longPress : {})}
        className="py-3.5 border-b border-ink/10 dark:border-snow/10"
      >
        <div className="flex items-center gap-2 text-xs mb-1">
          <span className="font-semibold opacity-70">{a.sourceName}</span>
          <span className="opacity-50">·</span>
          <time className="opacity-60">{timeAgo(a.publishedAt)}</time>
          {card.alternates.length > 0 && (
            <button
              onClick={() => setSourcesOpen((v) => !v)}
              aria-expanded={sourcesOpen}
              className="rounded-full bg-accent/10 text-accent px-2 py-px font-semibold"
            >
              +{card.alternates.length} {sourcesOpen ? '▴' : '▾'}
            </button>
          )}
          <button
            aria-label={card.read ? 'Mark as unread' : 'Mark as read'}
            onClick={() => onToggleRead(card)}
            className="ml-auto -m-2 p-2"
          >
            <span
              className={`block h-2.5 w-2.5 rounded-full transition-colors ${
                card.read ? 'border-2 border-ink/25 dark:border-snow/25' : 'bg-accent'
              }`}
            />
          </button>
        </div>

        <Link to={`/article/${a.id}`} className="block group">
          <p className="text-[0.95rem] leading-relaxed">
            {text}
            <span className="ml-2 text-xs text-accent opacity-80 group-hover:opacity-100 whitespace-nowrap">
              read more{a.readingMinutes ? ` · ${a.readingMinutes} min` : ''} →
            </span>
          </p>
        </Link>

        {quote && (
          <blockquote className="mt-2.5 border-l-2 border-accent/60 pl-3 font-serif text-[1.05rem] italic leading-snug">
            “{quote.text}”
            <footer className="mt-0.5 not-italic font-sans text-xs opacity-60">— {quote.who}</footer>
          </blockquote>
        )}

        {sourcesOpen && (
          <ul className="mt-2.5 space-y-2 border-l-2 border-accent/30 pl-3">
            {sources.map((s) => (
              <li key={s.id}>
                <Link to={`/article/${s.id}`} className="block group/src">
                  <span className="text-xs opacity-60">
                    {s.sourceName} · {timeAgo(s.publishedAt)}
                  </span>
                  <span className="block text-sm font-serif font-semibold leading-snug group-hover/src:text-accent transition-colors">
                    {s.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </article>
    </SwipeToRead>
  );
}

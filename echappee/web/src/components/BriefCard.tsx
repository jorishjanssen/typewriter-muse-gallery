import { useState } from 'react';
import { Link } from 'react-router-dom';
import { timeAgo, type ArticleCard, type FeedCard } from '../lib/api';
import { useLongPress } from '../lib/useLongPress';
import SwipeToRead from './SwipeToRead';

/**
 * The story's own photo. Small images blown up to full width look
 * pixelated, so anything under 600×300 natural pixels is dropped once
 * the browser knows its real size.
 */
function CardPhoto({ src, articleId }: { src: string; articleId: number }) {
  const [tooSmall, setTooSmall] = useState(false);
  if (tooSmall) return null;
  return (
    <Link to={`/article/${articleId}`} className="block mt-2.5">
      <img
        src={src}
        alt=""
        loading="lazy"
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth < 600 || img.naturalHeight < 300) setTooSmall(true);
        }}
        onError={() => setTooSmall(true)}
        className="w-full aspect-[16/9] rounded-2xl object-cover"
      />
    </Link>
  );
}

/**
 * Compact, Twitter-style rendering of a story: the news itself in ~360
 * chars. Multi-source stories get a tappable sources drawer; a pull-quote
 * or the story's photo shows when the feed decides this card may carry one.
 */
export default function BriefCard({
  card,
  onToggleRead,
  onLongPress,
  showQuote = false,
  showPhoto = false,
}: {
  card: FeedCard;
  onToggleRead: (card: FeedCard) => void;
  onLongPress?: (card: FeedCard) => void;
  showQuote?: boolean;
  showPhoto?: boolean;
}) {
  const a = card.article;
  const text = card.clusterBrief ?? a.brief ?? a.summary ?? a.excerpt ?? a.title;
  const longPress = useLongPress(() => onLongPress?.(card));
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const quote = showQuote
    ? ([a, ...card.alternates].find((x) => x.quote)?.quote ?? null)
    : null;
  const sources: ArticleCard[] = [a, ...card.alternates];
  // This story's photo — from the displayed article when it has one, else
  // any source in the cluster.
  const photoOwner = showPhoto ? sources.find((s) => s.imageUrl) : undefined;
  // Story importance = the highest rating across its coverage. Only 4 and 5
  // get a marker (one or two bolts); routine stories stay clean.
  const importance = Math.max(...sources.map((s) => s.importance));

  return (
    <SwipeToRead read={card.read} onToggle={() => onToggleRead(card)}>
      <article
        {...(onLongPress ? longPress : {})}
        className="py-3.5 border-b border-ink/10 dark:border-snow/10"
      >
        <div className="flex items-center gap-2 text-xs mb-1">
          {importance >= 4 && (
            <span
              className="flex text-accent -mr-0.5"
              aria-label={`importance ${importance} of 5`}
              title={`Importance ${importance}/5`}
            >
              {Array.from({ length: importance - 3 }, (_, i) => (
                <svg key={i} width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="-ml-0.5 first:ml-0">
                  <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
                </svg>
              ))}
            </span>
          )}
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
          {sources.some((s) => s.liked) && (
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="currentColor"
              className="text-accent" aria-label="You liked this story"
            >
              <path d="M7 10v12H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h3zm2 12V9.6L12 2a3.13 3.13 0 0 1 3 3.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H9z" />
            </svg>
          )}
          <button
            aria-label={card.read ? 'Mark as new' : 'Mark as seen'}
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

        {photoOwner && <CardPhoto src={photoOwner.imageUrl!} articleId={photoOwner.id} />}

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

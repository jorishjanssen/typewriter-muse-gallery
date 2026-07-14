import { Link } from 'react-router-dom';
import { CATEGORY_LABELS, timeAgo, type FeedCard } from '../lib/api';

const CATEGORY_COLORS: Record<string, string> = {
  racing: 'text-accent',
  transfers: 'text-sky-600 dark:text-sky-400',
  gear: 'text-emerald-700 dark:text-emerald-400',
  offroad: 'text-amber-700 dark:text-amber-400',
  other: 'text-ink/50 dark:text-snow/50',
};

export default function StoryCard({ card }: { card: FeedCard }) {
  const a = card.article;
  return (
    <article
      className={`py-4 border-b border-ink/10 dark:border-snow/10 transition-opacity ${
        card.read ? 'opacity-45' : ''
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
          {!card.read && <span className="ml-auto h-2 w-2 rounded-full bg-accent" aria-label="unread" />}
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
      {card.alternates.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="opacity-50">also on</span>
          {card.alternates.map((alt) => (
            <Link
              key={alt.id}
              to={`/article/${alt.id}`}
              className="rounded-full border border-ink/15 dark:border-snow/20 px-2 py-0.5 opacity-70 hover:opacity-100 hover:border-accent hover:text-accent transition-colors"
            >
              {alt.sourceName}
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}

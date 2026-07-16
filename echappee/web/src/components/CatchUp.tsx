import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, timeAgo } from '../lib/api';

/** One-glance triage of the unread pile: the big stories. The corner ✕ dismisses it for the session. */
export default function CatchUp() {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('echappee-catchup-dismissed') === '1'
  );
  const catchup = useQuery({ queryKey: ['catchup'], queryFn: api.catchup, staleTime: 60_000 });

  const data = catchup.data;
  if (dismissed || !data || data.unreadStories < 8) return null;

  const dismiss = () => {
    sessionStorage.setItem('echappee-catchup-dismissed', '1');
    setDismissed(true);
  };

  return (
    <section className="my-3 rounded-2xl border border-ink/15 dark:border-snow/15 bg-ink/[0.03] dark:bg-snow/[0.04] p-4">
      <div className="flex items-baseline gap-2">
        <h2 className="font-serif text-lg font-bold">While you were away</h2>
        <button onClick={dismiss} aria-label="Dismiss" className="ml-auto -m-2 p-2 opacity-50 hover:opacity-100">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <p className="text-sm opacity-70 mb-3">
        {data.unreadStories} unread stories
        {data.big.length > 0 ? ` — ${data.big.length} big ${data.big.length === 1 ? 'one' : 'ones'}:` : '.'}
      </p>
      {data.big.length > 0 && (
        <ul className="space-y-2.5">
          {data.big.map((b) => (
            <li key={b.clusterId}>
              <Link to={`/article/${b.article.id}`} className="block group">
                <span className="text-xs opacity-60">
                  {b.article.sourceName} · {timeAgo(b.article.publishedAt)}
                  {b.sources > 1 ? ` · ${b.sources} sources` : ''}
                </span>
                <span className="block font-serif font-semibold leading-snug group-hover:text-accent transition-colors">
                  {b.article.title}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

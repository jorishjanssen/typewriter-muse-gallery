import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import BackLink, { useGoBack } from '../components/BackLink';
import { SkeletonArticle } from '../components/Skeleton';
import { api, CATEGORY_LABELS, timeAgo, type FullArticle } from '../lib/api';

export default function Reader() {
  const { id } = useParams<{ id: string }>();
  const goBack = useGoBack();
  const queryClient = useQueryClient();

  const article = useQuery({
    queryKey: ['article', id],
    queryFn: () => api.article(id!),
    enabled: !!id,
  });

  const markRead = useMutation({
    mutationFn: (articleId: number) => api.markRead(articleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });

  // Opening an article marks it read.
  useEffect(() => {
    if (article.data && !article.data.read) markRead.mutate(article.data.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article.data?.id]);

  const like = useMutation({
    mutationFn: ({ articleId, liked }: { articleId: number; liked: boolean }) =>
      liked ? api.like(articleId) : api.unlike(articleId),
    onMutate: ({ liked }) => {
      // Optimistic: flip immediately, the POST catches up.
      queryClient.setQueryData<FullArticle>(['article', id], (prev) =>
        prev ? { ...prev, liked } : prev
      );
      if (liked && navigator.vibrate) navigator.vibrate(10);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
    },
  });

  // Swipe right anywhere in the article to go back — no need to reach for
  // the top link or the tab bar after reading to the bottom.
  const touch = useRef({ x: 0, y: 0 });
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    if (dx > 90 && Math.abs(dy) < 70) goBack();
  };

  const a = article.data;

  return (
    <div
      className="min-h-screen pb-24 pt-[env(safe-area-inset-top)]"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="mx-auto max-w-2xl px-4">
        <div className="pt-2">
          <BackLink label="Back" />
        </div>
        {article.isLoading && <SkeletonArticle />}
        {article.isError && <p className="py-12 text-center opacity-60">Article not found.</p>}
        {a && (
          <article className="py-4">
            <div className="text-xs mb-3 flex flex-wrap items-center gap-2">
              <span className="font-semibold uppercase tracking-wide text-accent">
                {CATEGORY_LABELS[a.category]}
              </span>
              <span className="opacity-50">·</span>
              <span className="opacity-60">{a.sourceName}</span>
              {a.author && (
                <>
                  <span className="opacity-50">·</span>
                  <span className="opacity-60">{a.author}</span>
                </>
              )}
              <span className="opacity-50">·</span>
              <time className="opacity-60">{timeAgo(a.publishedAt)}</time>
              {a.readingMinutes && (
                <>
                  <span className="opacity-50">·</span>
                  <span className="opacity-60">{a.readingMinutes} min read</span>
                </>
              )}
            </div>
            <h1 className="font-serif text-2xl md:text-3xl font-bold leading-tight">{a.title}</h1>
            {a.riders?.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {a.riders.map((r) => (
                  <Link
                    key={r.key}
                    to={`/rider/${encodeURIComponent(r.key)}?name=${encodeURIComponent(r.name)}`}
                    className="rounded-full bg-accent/10 text-accent px-3 py-1 text-xs font-semibold hover:bg-accent hover:text-white transition-colors"
                  >
                    {r.name}
                  </Link>
                ))}
              </div>
            )}
            {a.summary && (
              <p className="mt-3 text-[0.95rem] leading-relaxed border-l-4 border-accent/60 pl-3 opacity-85">
                {a.summary}
              </p>
            )}
            {a.imageUrl && (
              <img src={a.imageUrl} alt="" className="mt-5 w-full rounded-2xl object-cover" />
            )}

            {a.contentHtml ? (
              <div className="article-body mt-5" dangerouslySetInnerHTML={{ __html: a.contentHtml }} />
            ) : (
              <div className="mt-6 space-y-3">
                {a.excerpt && <p className="article-body opacity-85">{a.excerpt}</p>}
                <p className="text-sm opacity-60">Full text couldn't be extracted for this one.</p>
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-2 text-sm">
              <button
                onClick={() => like.mutate({ articleId: a.id, liked: !a.liked })}
                aria-pressed={a.liked}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 font-semibold transition-colors ${
                  a.liked
                    ? 'bg-accent text-white'
                    : 'border border-ink/15 dark:border-snow/20 opacity-80 hover:opacity-100'
                }`}
              >
                <svg
                  width="16" height="16" viewBox="0 0 24 24"
                  fill={a.liked ? 'currentColor' : 'none'}
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                  <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
                </svg>
                {a.liked ? 'Liked!' : 'Good read'}
              </button>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-ink/15 dark:border-snow/20 px-4 py-2 opacity-70 hover:opacity-100"
              >
                Read on {a.sourceName} ↗
              </a>
              <button
                onClick={() => {
                  void api.markUnread(a.id).then(() => {
                    void queryClient.invalidateQueries();
                  });
                }}
                className="rounded-full border border-ink/15 dark:border-snow/20 px-4 py-2 opacity-70 hover:opacity-100"
              >
                Keep unread
              </button>
            </div>

            {a.alternates.length > 0 && (
              <div className="mt-8 border-t border-ink/10 dark:border-snow/10 pt-5">
                <h3 className="text-sm font-semibold opacity-60 mb-3">Same story elsewhere</h3>
                <ul className="space-y-2">
                  {a.alternates.map((alt) => (
                    <li key={alt.id}>
                      <Link to={`/article/${alt.id}`} className="group block">
                        <span className="text-xs opacity-60">{alt.sourceName} · {timeAgo(alt.publishedAt)}</span>
                        <span className="block font-serif font-semibold group-hover:text-accent transition-colors">
                          {alt.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={goBack}
              className="mt-8 w-full rounded-xl bg-ink text-paper dark:bg-snow dark:text-night py-3 text-sm font-semibold"
            >
              ← Back to feed
            </button>
          </article>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef } from 'react';

/**
 * Invisible sentinel that fetches the next page as it approaches the
 * viewport, replacing the "Load more" button. The observer is re-armed
 * after each load so a still-visible sentinel keeps paging.
 */
export default function InfiniteScroll({
  hasMore,
  loading,
  onMore,
}: {
  hasMore: boolean;
  loading: boolean;
  onMore: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const cb = useRef(onMore);
  cb.current = onMore;

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore || loading) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) cb.current();
      },
      { rootMargin: '600px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading]);

  if (!hasMore) return null;
  return (
    <div ref={ref} className="py-6 text-center text-sm opacity-50" aria-hidden>
      {loading ? 'Loading more…' : ''}
    </div>
  );
}

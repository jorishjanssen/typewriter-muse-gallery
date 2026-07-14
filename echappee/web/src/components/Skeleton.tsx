function Bar({ className }: { className: string }) {
  return <div className={`rounded bg-ink/10 dark:bg-snow/10 ${className}`} />;
}

/** Placeholder story card shown while the feed loads. */
export function SkeletonCard({ withImage = true }: { withImage?: boolean }) {
  return (
    <div className="py-4 border-b border-ink/10 dark:border-snow/10 animate-pulse" aria-hidden>
      <Bar className="h-3 w-44 mb-3" />
      <div className="flex gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Bar className="h-5 w-full" />
          <Bar className="h-5 w-3/4" />
          <Bar className="h-3 w-full mt-3" />
          <Bar className="h-3 w-2/3" />
        </div>
        {withImage && <Bar className="h-20 w-20 shrink-0 !rounded-xl" />}
      </div>
    </div>
  );
}

export function SkeletonFeed() {
  return (
    <div role="status" aria-label="Loading feed">
      {Array.from({ length: 6 }, (_, i) => (
        <SkeletonCard key={i} withImage={i % 2 === 0} />
      ))}
    </div>
  );
}

/** Placeholder for the reader view while an article loads. */
export function SkeletonArticle() {
  return (
    <div className="py-6 animate-pulse" role="status" aria-label="Loading article">
      <Bar className="h-3 w-52 mb-4" />
      <Bar className="h-7 w-full mb-2" />
      <Bar className="h-7 w-4/5 mb-6" />
      <Bar className="h-48 w-full !rounded-2xl mb-6" />
      <div className="space-y-3">
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-5/6" />
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-2/3" />
      </div>
    </div>
  );
}

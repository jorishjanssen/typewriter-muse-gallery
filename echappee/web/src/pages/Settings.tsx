import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import TopBar, { IconButton } from '../components/TopBar';
import { api, timeAgo, type Mute } from '../lib/api';

export default function Settings() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ['status'], queryFn: api.status });
  const sources = useQuery({ queryKey: ['sources'], queryFn: api.sources });
  const mutes = useQuery({ queryKey: ['mutes'], queryFn: api.mutes });
  const [term, setTerm] = useState('');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['mutes'] });
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
  };

  const addMute = useMutation({
    mutationFn: ({ kind, value }: { kind: Mute['kind']; value: string }) => api.addMute(kind, value),
    onSuccess: invalidate,
  });
  const removeMute = useMutation({
    mutationFn: (id: number) => api.removeMute(id),
    onSuccess: invalidate,
  });
  const readAll = useMutation({
    mutationFn: api.readAll,
    onSuccess: () => void queryClient.invalidateQueries(),
  });

  const termMutes = mutes.data?.filter((m) => m.kind === 'term') ?? [];
  const sourceMutes = mutes.data?.filter((m) => m.kind === 'source') ?? [];

  return (
    <div className="min-h-screen pb-16">
      <TopBar
        right={
          <IconButton label="Back to feed" to="/">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M19 12H5m7-7-7 7 7 7" />
            </svg>
          </IconButton>
        }
      />
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-10">
        <section>
          <h2 className="font-serif text-xl font-bold mb-3">Reading</h2>
          <button
            onClick={() => readAll.mutate()}
            className="rounded-full border border-ink/15 dark:border-snow/20 px-4 py-2 text-sm font-medium opacity-80 hover:opacity-100"
          >
            Mark everything as read
          </button>
          {status.data && (
            <p className="mt-2 text-sm opacity-60">
              {status.data.unread} unread of {status.data.articles} articles.
            </p>
          )}
        </section>

        <section>
          <h2 className="font-serif text-xl font-bold mb-1">Muted terms</h2>
          <p className="text-sm opacity-60 mb-3">
            Stories whose title or summary contains a muted term disappear from the feed —
            riders, teams, races, whatever you're tired of.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (term.trim()) {
                addMute.mutate({ kind: 'term', value: term.trim() });
                setTerm('');
              }
            }}
          >
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="e.g. sportswashing"
              className="flex-1 rounded-xl border border-ink/15 dark:border-snow/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button className="rounded-xl bg-ink text-paper dark:bg-snow dark:text-night px-4 text-sm font-medium">
              Mute
            </button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {termMutes.map((m) => (
              <button
                key={m.id}
                onClick={() => removeMute.mutate(m.id)}
                title="Unmute"
                className="rounded-full bg-accent-soft text-accent px-3 py-1 text-sm font-medium hover:line-through"
              >
                {m.value} ×
              </button>
            ))}
            {termMutes.length === 0 && <p className="text-sm opacity-50">No muted terms.</p>}
          </div>
        </section>

        <section>
          <h2 className="font-serif text-xl font-bold mb-1">Sources</h2>
          <p className="text-sm opacity-60 mb-3">
            Tap a source to mute/unmute it. Health shows the latest scrape result.
          </p>
          <ul className="divide-y divide-ink/10 dark:divide-snow/10">
            {sources.data?.map((s) => {
              const muted = sourceMutes.find((m) => m.value === s.key);
              return (
                <li key={s.key} className="py-3 flex items-center gap-3">
                  <button
                    onClick={() =>
                      muted
                        ? removeMute.mutate(muted.id)
                        : addMute.mutate({ kind: 'source', value: s.key })
                    }
                    className={`flex-1 text-left ${muted ? 'opacity-40 line-through' : ''}`}
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="ml-2 text-xs uppercase opacity-50">{s.lang}</span>
                    <span className="block text-xs opacity-60">
                      {s.articlesTotal} articles
                      {s.lastOkAt && ` · last ok ${timeAgo(s.lastOkAt)}`}
                      {s.lastError && (
                        <span className="text-accent"> · error: {s.lastError.slice(0, 80)}</span>
                      )}
                      {!s.lastRunAt && ' · not scraped yet'}
                    </span>
                  </button>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      s.lastError ? 'bg-accent' : s.lastOkAt ? 'bg-emerald-500' : 'bg-ink/20 dark:bg-snow/20'
                    }`}
                    aria-label={s.lastError ? 'failing' : s.lastOkAt ? 'healthy' : 'unknown'}
                  />
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-xl font-bold mb-1">AI pipeline</h2>
          {status.data && (
            <p className="text-sm opacity-70 leading-relaxed">
              {status.data.llm.enabled ? (
                <>
                  Enabled — model <code>{status.data.llm.model}</code> via{' '}
                  <code>{status.data.llm.baseUrl}</code>. Summaries, categories and story
                  clustering are AI-assisted.
                </>
              ) : (
                <>
                  Disabled. Set <code>LLM_API_KEY</code> (and optionally <code>LLM_BASE_URL</code>,{' '}
                  <code>LLM_MODEL</code> — any OpenAI-compatible provider, DeepSeek by default) to
                  get summaries and smarter clustering. Keyword-based categories are used meanwhile.
                </>
              )}{' '}
              Sources refresh every {status.data.scrapeIntervalMinutes} minutes.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

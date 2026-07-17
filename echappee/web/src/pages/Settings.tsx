import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, timeAgo, type LlmTask, type Mute } from '../lib/api';

const AUTOSEEN_KEY = 'echappee-autoseen';

export default function Settings() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ['status'], queryFn: api.status });
  const sources = useQuery({ queryKey: ['sources'], queryFn: api.sources });
  const mutes = useQuery({ queryKey: ['mutes'], queryFn: api.mutes });
  const [term, setTerm] = useState('');
  const [autoSeen, setAutoSeen] = useState(() => localStorage.getItem(AUTOSEEN_KEY) !== '0');

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
    <div className="min-h-screen pb-24 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-10">
        <h1 className="font-serif text-2xl font-bold -mb-4">Settings</h1>
        <section>
          <h2 className="font-serif text-xl font-bold mb-3">Reading</h2>
          <button
            onClick={() => readAll.mutate()}
            className="rounded-full border border-ink/15 dark:border-snow/20 px-4 py-2 text-sm font-medium opacity-80 hover:opacity-100"
          >
            Mark everything as seen
          </button>
          {status.data && (
            <p className="mt-2 text-sm opacity-60">
              {status.data.unread} new of {status.data.articles} stories.
            </p>
          )}
          <label className="mt-4 flex items-start gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={autoSeen}
              onChange={(e) => {
                setAutoSeen(e.target.checked);
                localStorage.setItem(AUTOSEEN_KEY, e.target.checked ? '1' : '0');
              }}
              className="mt-0.5 h-4 w-4 accent-[#e04f1f]"
            />
            <span>
              <span className="font-medium">Scrolling past a story marks it as seen</span>
              <span className="block opacity-60">
                Stories you scroll past leave the New list — they stay visible until
                you refresh. Skips are tracked per source so you can see which sources you
                actually read.
              </span>
            </span>
          </label>
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
                    {s.readPct !== null && (
                      <span
                        className={`ml-2 rounded-full px-2 py-px text-xs font-semibold ${
                          s.readPct >= 40
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                            : s.readPct >= 15
                              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                              : 'bg-accent/10 text-accent'
                        }`}
                        title={`You opened ${s.opened} of the ${s.opened + s.skipped} stories you triaged`}
                      >
                        {s.readPct}% read
                      </span>
                    )}
                    <span className="block text-xs opacity-60">
                      {s.articlesTotal} articles
                      {s.readPct !== null && ` · opened ${s.opened}, skipped ${s.skipped}`}
                      {s.liked > 0 && ` · 👍 ${s.liked}`}
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

        <ModelSection />

        <section>
          <h2 className="font-serif text-xl font-bold mb-1">AI pipeline</h2>
          {status.data && (
            <p className="text-sm opacity-70 leading-relaxed">
              {status.data.llm.enabled ? (
                <>
                  Enabled — model <code>{status.data.llm.model}</code> via{' '}
                  <code>{status.data.llm.baseUrl}</code>. Summaries, categories, riders and story
                  clustering are AI-assisted.
                </>
              ) : status.data.managedScraper ? (
                <>
                  Enrichment runs inside the scheduled scraper (GitHub Actions) with model{' '}
                  <code>{status.data.llm.model}</code> — summaries, riders and clustering are
                  applied there as new articles arrive.
                </>
              ) : (
                <>
                  Disabled. Set <code>AI_GATEWAY_API_KEY</code> or <code>LLM_API_KEY</code> to get
                  summaries, riders and smarter clustering.
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

const MODEL_PRESETS = [
  { slug: 'deepseek/deepseek-v3.1', label: 'DeepSeek V3.1', note: 'cheap' },
  { slug: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro', note: 'reasoning' },
  { slug: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5', note: 'fast' },
  { slug: 'openai/gpt-4o-mini', label: 'GPT-4o mini', note: 'cheap' },
];

const TASKS: { key: LlmTask; label: string; hint: string }[] = [
  { key: 'enrich', label: 'Article enrichment', hint: 'summaries, riders, importance — bulk work, every article' },
  { key: 'brief', label: 'Merged briefs', hint: 'one brief per multi-source story' },
  { key: 'merge', label: 'Story merging', hint: 'judgement calls — a wrong merge hides a story' },
  { key: 'guide', label: 'Watch guides', hint: 'spoiler-free viewing tips per race day' },
];

function ModelSection() {
  const queryClient = useQueryClient();
  const setting = useQuery({ queryKey: ['llm-model'], queryFn: api.llmModel });
  const [custom, setCustom] = useState('');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['llm-model'] });
    void queryClient.invalidateQueries({ queryKey: ['status'] });
  };

  const save = useMutation({
    mutationFn: (model: string) => api.setLlmModel(model),
    onSuccess: () => {
      setCustom('');
      invalidate();
    },
  });

  const saveTask = useMutation({
    mutationFn: ({ task, model }: { task: LlmTask; model: string }) =>
      api.setLlmTaskModel(task, model),
    onSuccess: invalidate,
  });

  const active = setting.data?.model;

  return (
    <section>
      <h2 className="font-serif text-xl font-bold mb-1">AI model</h2>
      <p className="text-sm opacity-60 mb-3">
        The main model, used for judgement-heavy work. Changes apply from the next scrape
        (within ~30 minutes).
      </p>
      <div className="flex flex-wrap gap-2">
        {MODEL_PRESETS.map((m) => (
          <button
            key={m.slug}
            onClick={() => save.mutate(m.slug)}
            disabled={save.isPending}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
              active === m.slug
                ? 'bg-accent text-white border-transparent'
                : 'border-ink/15 dark:border-snow/20 opacity-70 hover:opacity-100'
            }`}
          >
            {m.label} <span className="opacity-60 text-xs">· {m.note}</span>
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom.trim()) save.mutate(custom.trim());
        }}
      >
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Custom slug, e.g. anthropic/claude-sonnet-4.5"
          className="flex-1 rounded-xl border border-ink/15 dark:border-snow/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          disabled={save.isPending || !custom.trim()}
          className="rounded-xl bg-ink text-paper dark:bg-snow dark:text-night px-4 text-sm font-medium disabled:opacity-40"
        >
          Use
        </button>
      </form>
      {setting.data && (
        <p className="mt-2 text-sm opacity-70">
          Active: <code>{setting.data.model}</code>
          {setting.data.custom && setting.data.custom !== setting.data.defaultModel && (
            <>
              {' · '}
              <button
                onClick={() => save.mutate('')}
                className="underline underline-offset-2 hover:text-accent"
              >
                reset to default ({setting.data.defaultModel})
              </button>
            </>
          )}
        </p>
      )}
      {save.isError && (
        <p className="mt-2 text-sm text-accent">Could not save — check the model id.</p>
      )}

      {setting.data && (
        <div className="mt-6">
          <h3 className="font-semibold mb-1">Per task</h3>
          <p className="text-sm opacity-60 mb-3">
            Bulk labeling defaults to a cheap model; judgement calls default to the main model
            above. Pin any task to a specific model.
          </p>
          <ul className="space-y-3">
            {TASKS.map((t) => {
              const state = setting.data!.tasks[t.key];
              return (
                <li key={t.key} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{t.label}</span>
                    <span className="block text-xs opacity-60">{t.hint}</span>
                  </span>
                  <select
                    value={state.override ?? ''}
                    onChange={(e) => saveTask.mutate({ task: t.key, model: e.target.value })}
                    disabled={saveTask.isPending}
                    className="max-w-[45%] rounded-xl border border-ink/15 dark:border-snow/20 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent"
                  >
                    <option value="">Auto · {state.effective.split('/').pop()}</option>
                    {MODEL_PRESETS.map((m) => (
                      <option key={m.slug} value={m.slug}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

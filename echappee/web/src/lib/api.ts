export type Category = 'racing' | 'transfers' | 'gear' | 'offroad' | 'other';

export interface ArticleCard {
  id: number;
  sourceKey: string;
  sourceName: string;
  url: string;
  title: string;
  author: string | null;
  publishedAt: string;
  excerpt: string | null;
  imageUrl: string | null;
  lang: string;
  category: Category;
  summary: string | null;
  brief: string | null;
  hasFullText: boolean;
  readingMinutes: number | null;
  importance: number;
  /** Striking verbatim quote pulled from the article, when one exists. */
  quote: { text: string; who: string } | null;
  read: boolean;
  /** Thumbs-up: "this was a good read". */
  liked: boolean;
}

export interface FeedCard {
  clusterId: number;
  article: ArticleCard;
  alternates: ArticleCard[];
  /** Merged multi-source brief for the whole story, when generated. */
  clusterBrief: string | null;
  /** Newest coverage in the cluster — drives feed position and day dividers. */
  latestPublishedAt: string;
  /** Race this story belongs to, when linked — used to collapse race-day coverage. */
  raceId: number | null;
  read: boolean;
}

export interface FeedPage {
  cards: FeedCard[];
  nextBefore: string | null;
}

export interface FullArticle extends ArticleCard {
  contentHtml: string | null;
  alternates: ArticleCard[];
  riders: RiderRef[];
}

export interface RiderRef {
  key: string;
  name: string;
}

export interface Rider extends RiderRef {
  articles: number;
}

export interface RaceRow {
  id: number;
  raceKey: string;
  raceName: string;
  stageLabel: string;
  raceDate: string | null;
  articles: number;
  hasGuide: boolean;
}

export interface WatchGuideOption {
  fromKm: number;
  minutes: number | 'full';
  /** 1-5, how good this entry point is. Options arrive ranked best first. */
  rating: number;
}

export interface RaceDetail {
  id: number;
  raceName: string;
  stageLabel: string;
  raceDate: string | null;
  articleCount: number;
  /** Spoiler-safe build-up stories, shown openly. */
  previewCount: number;
  /** Reports and reactions — behind the reveal. */
  spoilerCount: number;
  guide: { options: WatchGuideOption[] } | null;
  guideGeneratedAt: string | null;
}

export interface RaceBanner {
  raceId: number | null;
  raceName?: string;
  stageLabel?: string;
  /** False while today's race has no watch guide yet (race still on). */
  hasGuide?: boolean;
}

export interface Mute {
  id: number;
  kind: 'term' | 'source' | 'category';
  value: string;
}

export interface SourceHealth {
  key: string;
  name: string;
  homepage: string;
  lang: string;
  enabled: boolean;
  feedUrl: string;
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  articlesTotal: number;
  /** Articles actually opened in the reader. */
  opened: number;
  /** Articles dismissed (scrolled past / swiped) without opening. */
  skipped: number;
  /** Articles given a thumbs-up. */
  liked: number;
  /** opened / (opened + skipped), or null before any triage. */
  readPct: number | null;
}

export type LlmTask = 'enrich' | 'brief' | 'merge' | 'guide';

export interface LlmModelSetting {
  model: string;
  defaultModel: string;
  custom: string | null;
  /** Per-task override (null = automatic) and the model actually used. */
  tasks: Record<LlmTask, { override: string | null; effective: string }>;
}

export interface Status {
  articles: number;
  unread: number;
  llm: { enabled: boolean; model: string; baseUrl: string };
  scrapeIntervalMinutes: number;
  managedScraper: boolean;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    // Fastify 400s on an empty body with a JSON content type, so only
    // declare JSON when we actually send one.
    ...(init?.body ? { headers: { 'Content-Type': 'application/json' } } : {}),
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  feed: (opts: {
    category?: Category;
    rider?: string;
    race?: number;
    raceKind?: 'preview' | 'post';
    unread?: boolean;
    before?: string;
  }) => {
    const params = new URLSearchParams();
    if (opts.category) params.set('category', opts.category);
    if (opts.rider) params.set('rider', opts.rider);
    if (opts.race) params.set('race', String(opts.race));
    if (opts.raceKind) params.set('raceKind', opts.raceKind);
    if (opts.unread) params.set('unread', '1');
    if (opts.before) params.set('before', opts.before);
    return request<FeedPage>(`/api/feed?${params}`);
  },
  riders: () => request<Rider[]>('/api/riders'),
  races: () => request<RaceRow[]>('/api/races'),
  race: (id: number | string) => request<RaceDetail>(`/api/races/${id}`),
  raceBanner: () => request<RaceBanner>('/api/race-banner'),
  llmModel: () => request<LlmModelSetting>('/api/settings/llm'),
  setLlmModel: (model: string) =>
    request<LlmModelSetting>('/api/settings/llm', { method: 'PUT', body: JSON.stringify({ model }) }),
  setLlmTaskModel: (task: LlmTask, model: string) =>
    request<LlmModelSetting>('/api/settings/llm', {
      method: 'PUT',
      body: JSON.stringify({ tasks: { [task]: model } }),
    }),
  article: (id: number | string) => request<FullArticle>(`/api/articles/${id}`),
  markRead: (id: number) => request(`/api/articles/${id}/read`, { method: 'POST' }),
  markUnread: (id: number) => request(`/api/articles/${id}/unread`, { method: 'POST' }),
  like: (id: number) => request(`/api/articles/${id}/like`, { method: 'POST' }),
  unlike: (id: number) => request(`/api/articles/${id}/unlike`, { method: 'POST' }),
  nextUnread: (id: number | string) =>
    request<{ id: number | null }>(`/api/articles/${id}/next-unread`),
  markClusterRead: (id: number) => request(`/api/clusters/${id}/read`, { method: 'POST' }),
  markClusterUnread: (id: number) => request(`/api/clusters/${id}/unread`, { method: 'POST' }),
  readAll: () => request('/api/read-all', { method: 'POST' }),
  mutes: () => request<Mute[]>('/api/mutes'),
  addMute: (kind: Mute['kind'], value: string) =>
    request<Mute[]>('/api/mutes', { method: 'POST', body: JSON.stringify({ kind, value }) }),
  removeMute: (id: number) => request<Mute[]>(`/api/mutes/${id}`, { method: 'DELETE' }),
  sources: () => request<SourceHealth[]>('/api/sources'),
  status: () => request<Status>('/api/status'),
  refresh: () => request('/api/refresh', { method: 'POST' }),
};

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

export const CATEGORY_LABELS: Record<Category, string> = {
  racing: 'Racing',
  transfers: 'Transfers',
  gear: 'Gear',
  offroad: 'Off-road',
  other: 'Other',
};

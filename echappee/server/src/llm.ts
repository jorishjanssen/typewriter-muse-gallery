import OpenAI from 'openai';
import { config, llmEnabled } from './config.js';
import type { Category } from './sources.js';

export interface Enrichment {
  summary: string;
  category: Category;
  /** Index into the candidate cluster list, or null for a new story. */
  clusterMatch: number | null;
  /** Full names of the riders the article is mainly about (0-3). */
  riders: string[];
  /** Standalone news brief (<=360 chars, article's language), or null. */
  brief: string | null;
  /** Specific race day this article is about, or null. */
  race: RaceRef | null;
  /** How significant this news is for a cycling fan (1-5). */
  importance: number;
}

export interface RaceRef {
  name: string;
  year: number;
  stage: number | null;
  date: string | null;
  kind: 'report' | 'preview' | 'other';
}

export interface WatchGuide {
  excitement: number;
  summary: string;
  tiers: { minutes: number | 'full'; fromKm: number; why: string }[];
}

/** Diacritic-insensitive grouping key: "Tadej Pogačar" and "Pogacar" unify. */
export function riderKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

const CATEGORIES: Category[] = ['racing', 'transfers', 'gear', 'offroad', 'other'];

let client: OpenAI | null = null;

// Model override from the settings table (set by the UI); wins over env.
let modelOverride: string | null = null;

export function setLlmModel(model: string | null | undefined): void {
  modelOverride = model?.trim() ? model.trim() : null;
}

export function currentLlmModel(): string {
  return modelOverride ?? config.llm.model;
}

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      baseURL: config.llm.baseUrl,
      apiKey: config.llm.apiKey,
    });
  }
  return client;
}

const SYSTEM_PROMPT = `You are the enrichment step of a personal cycling news aggregator.
Given one article and a list of recent story clusters, respond with ONLY a JSON object:
{
  "summary": "2 concise sentences in the SAME language as the article",
  "category": "racing" | "transfers" | "gear" | "offroad" | "other",
  "cluster_match": <index of the cluster covering the SAME news event, or null>,
  "riders": ["Full official rider name", ...],
  "brief": "standalone news brief",
  "race": {"name": "Race name without year", "year": 2026, "stage": <stage number or null>, "date": "YYYY-MM-DD or null", "kind": "report" | "preview" | "other"} | null,
  "importance": <1-5>
}
Category guide: racing = race reports/previews/results; transfers = contracts, team moves, rider career news, injuries; gear = bikes, components, products, tech; offroad = gravel/MTB/cyclocross/track; other = everything else.
cluster_match must only be set when the article covers the same concrete news event as the cluster, not merely the same topic.
riders: at most 3, ONLY the riders the article is mainly about — not everyone mentioned. Use the full official name with correct diacritics (e.g. "Tadej Pogačar", "Mathieu van der Poel"). [] when the article is not about specific riders.
brief: the news itself as one punchy standalone post of AT MOST 360 characters, in the SAME language as the article. Lead with what happened; no hashtags, no "the article says".
race: ONLY when the article is about one specific race day (a stage or a one-day race). kind: report = describes how the race unfolded / its result; preview = published before the race; other = stage-related news that is neither. null when not about a specific race day.
importance: 5 = major news every cycling fan must see (grand tour stage results, big-name transfers or crashes); 4 = significant; 3 = notable; 2 = routine; 1 = minor/filler (TV listings, promos, minor interviews).`;

export async function enrichArticle(input: {
  title: string;
  text: string;
  lang: string;
  candidateClusters: { title: string }[];
}): Promise<Enrichment | null> {
  if (!llmEnabled()) return null;

  const clusterList = input.candidateClusters
    .map((c, i) => `${i}: ${c.title}`)
    .join('\n');

  const userPrompt = [
    `Article language: ${input.lang}`,
    `Title: ${input.title}`,
    `Text (truncated): ${input.text.slice(0, 4000)}`,
    '',
    'Recent clusters:',
    clusterList.length > 0 ? clusterList : '(none)',
  ].join('\n');

  try {
    const res = await getClient().chat.completions.create({
      model: currentLlmModel(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 400,
    });
    const raw = res.choices[0]?.message?.content ?? '';
    return parseEnrichment(raw, input.candidateClusters.length);
  } catch (err) {
    console.error('[llm] enrichment failed:', (err as Error).message);
    return null;
  }
}

/** Exported for tests. Tolerates markdown fences and stray prose around the JSON. */
export function parseEnrichment(raw: string, clusterCount: number): Enrichment | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as {
      summary?: unknown;
      category?: unknown;
      cluster_match?: unknown;
      riders?: unknown;
      brief?: unknown;
      race?: unknown;
      importance?: unknown;
    };
    const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
    const category = CATEGORIES.includes(obj.category as Category)
      ? (obj.category as Category)
      : 'other';
    let clusterMatch: number | null = null;
    if (
      typeof obj.cluster_match === 'number' &&
      Number.isInteger(obj.cluster_match) &&
      obj.cluster_match >= 0 &&
      obj.cluster_match < clusterCount
    ) {
      clusterMatch = obj.cluster_match;
    }
    const riders = Array.isArray(obj.riders)
      ? [
          ...new Set(
            obj.riders
              .filter((r): r is string => typeof r === 'string')
              .map((r) => r.trim())
              .filter((r) => r.length > 1 && r.length < 60)
          ),
        ].slice(0, 3)
      : [];
    let brief: string | null = null;
    if (typeof obj.brief === 'string' && obj.brief.trim().length > 20) {
      brief = obj.brief.trim().slice(0, 400);
    }
    let race: RaceRef | null = null;
    if (obj.race && typeof obj.race === 'object') {
      const r = obj.race as Record<string, unknown>;
      const name = typeof r.name === 'string' ? r.name.trim() : '';
      const year = typeof r.year === 'number' && r.year > 1900 && r.year < 2100 ? r.year : null;
      const kind = ['report', 'preview', 'other'].includes(r.kind as string)
        ? (r.kind as RaceRef['kind'])
        : 'other';
      if (name && name.length < 80 && year) {
        race = {
          name,
          year,
          stage:
            typeof r.stage === 'number' && r.stage >= 1 && r.stage <= 30 ? r.stage : null,
          date: typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null,
          kind,
        };
      }
    }
    const importance =
      typeof obj.importance === 'number'
        ? Math.min(5, Math.max(1, Math.round(obj.importance)))
        : 2;
    if (!summary) return null;
    return { summary, category, clusterMatch, riders, brief, race, importance };
  } catch {
    return null;
  }
}

const MERGE_PROMPT = `You deduplicate story clusters for a cycling news aggregator.
You get two groups of article headlines (with summaries where available, possibly in different languages).
Respond with ONLY a JSON object: {"same": true | false}
same=true ONLY when both groups cover the SAME concrete news event — e.g. multiple outlets reporting the same race result, or the same transfer announcement.
same=false when in doubt, and always for: different races or different stages, a preview vs a report of the race, a result vs a separate interview/reaction/analysis about it, or the same rider appearing in unrelated news.
A wrong merge hides a story from the reader; a missed merge only shows a duplicate. Be conservative.`;

export interface ClusterDigest {
  /** Article titles, oldest first. */
  titles: string[];
  summary: string | null;
}

/** Ask whether two existing clusters cover the same news event. Null on LLM failure. */
export async function judgeClusterMerge(a: ClusterDigest, b: ClusterDigest): Promise<boolean | null> {
  if (!llmEnabled()) return null;
  const render = (label: string, c: ClusterDigest) =>
    [
      `CLUSTER ${label}:`,
      ...c.titles.map((t) => `- ${t}`),
      c.summary ? `Summary: ${c.summary.slice(0, 300)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  try {
    const res = await getClient().chat.completions.create({
      model: currentLlmModel(),
      messages: [
        { role: 'system', content: MERGE_PROMPT },
        { role: 'user', content: `${render('A', a)}\n\n${render('B', b)}` },
      ],
      temperature: 0,
      max_tokens: 20,
    });
    return parseMergeVerdict(res.choices[0]?.message?.content ?? '');
  } catch (err) {
    console.error('[llm] merge judgement failed:', (err as Error).message);
    return null;
  }
}

/** Exported for tests. Null unless the answer is an unambiguous boolean. */
export function parseMergeVerdict(raw: string): boolean | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as { same?: unknown };
    return typeof obj.same === 'boolean' ? obj.same : null;
  } catch {
    return null;
  }
}

const GUIDE_PROMPT = `You write SPOILER-FREE viewing guides for people who watch bike races on replay.
You get journalists' race reports of one finished race day. Respond with ONLY JSON:
{
  "excitement": <1-5, how exciting this race day was to watch>,
  "summary": "1-2 sentences describing the character of the race day WITHOUT naming any rider, team, nationality or outcome",
  "tiers": [
    {"minutes": 20, "from_km": <km-to-go to start watching if you have ~20 minutes>, "why": "spoiler-free reason"},
    {"minutes": 60, "from_km": <km-to-go for ~1 hour>, "why": "spoiler-free reason"},
    {"minutes": "full", "from_km": <km-to-go from which the racing is genuinely worth watching>, "why": "spoiler-free reason"}
  ]
}
HARD RULES: never mention rider names, team names, nationalities, jersey wearers, winners, or results anywhere. "why" describes race dynamics only ("the finale was chaotic", "decisive action started early on the final climb"). Round from_km to sensible values. As a broadcast rule of thumb ~25-30 km of racing is about an hour of viewing.`;

/** Generate a spoiler-free watch guide from the race reports of one race day. */
export async function generateWatchGuide(
  raceLabel: string,
  reports: string[]
): Promise<WatchGuide | null> {
  if (!llmEnabled()) return null;
  const body = reports
    .slice(0, 4)
    .map((t, i) => `REPORT ${i + 1}:\n${t.slice(0, 3000)}`)
    .join('\n\n');
  try {
    const res = await getClient().chat.completions.create({
      model: currentLlmModel(),
      messages: [
        { role: 'system', content: GUIDE_PROMPT },
        { role: 'user', content: `Race day: ${raceLabel}\n\n${body}` },
      ],
      temperature: 0.2,
      max_tokens: 500,
    });
    return parseWatchGuide(res.choices[0]?.message?.content ?? '');
  } catch (err) {
    console.error('[llm] watch guide failed:', (err as Error).message);
    return null;
  }
}

/** Exported for tests. */
export function parseWatchGuide(raw: string): WatchGuide | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    const excitement =
      typeof obj.excitement === 'number' ? Math.min(5, Math.max(1, Math.round(obj.excitement))) : 3;
    const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
    const tiers = Array.isArray(obj.tiers)
      ? obj.tiers
          .map((t) => {
            const tier = t as Record<string, unknown>;
            const minutes =
              tier.minutes === 'full'
                ? ('full' as const)
                : typeof tier.minutes === 'number'
                  ? tier.minutes
                  : null;
            const fromKm = typeof tier.from_km === 'number' ? Math.round(tier.from_km) : null;
            const why = typeof tier.why === 'string' ? tier.why.trim() : '';
            return minutes !== null && fromKm !== null && fromKm >= 0 && fromKm <= 300
              ? { minutes, fromKm, why }
              : null;
          })
          .filter((t): t is WatchGuide['tiers'][number] => t !== null)
      : [];
    if (!summary || tiers.length === 0) return null;
    return { excitement, summary, tiers };
  } catch {
    return null;
  }
}

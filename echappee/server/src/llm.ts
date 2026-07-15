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
  "brief": "standalone news brief"
}
Category guide: racing = race reports/previews/results; transfers = contracts, team moves, rider career news, injuries; gear = bikes, components, products, tech; offroad = gravel/MTB/cyclocross/track; other = everything else.
cluster_match must only be set when the article covers the same concrete news event as the cluster, not merely the same topic.
riders: at most 3, ONLY the riders the article is mainly about — not everyone mentioned. Use the full official name with correct diacritics (e.g. "Tadej Pogačar", "Mathieu van der Poel"). [] when the article is not about specific riders.
brief: the news itself as one punchy standalone post of AT MOST 360 characters, in the SAME language as the article. Lead with what happened; no hashtags, no "the article says".`;

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
    if (!summary) return null;
    return { summary, category, clusterMatch, riders, brief };
  } catch {
    return null;
  }
}

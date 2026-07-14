import OpenAI from 'openai';
import { config, llmEnabled } from './config.js';
import type { Category } from './sources.js';

export interface Enrichment {
  summary: string;
  category: Category;
  /** Index into the candidate cluster list, or null for a new story. */
  clusterMatch: number | null;
}

const CATEGORIES: Category[] = ['racing', 'transfers', 'gear', 'offroad', 'other'];

let client: OpenAI | null = null;

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
  "cluster_match": <index of the cluster covering the SAME news event, or null>
}
Category guide: racing = race reports/previews/results; transfers = contracts, team moves, rider career news, injuries; gear = bikes, components, products, tech; offroad = gravel/MTB/cyclocross/track; other = everything else.
cluster_match must only be set when the article covers the same concrete news event as the cluster, not merely the same topic.`;

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
      model: config.llm.model,
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
    if (!summary) return null;
    return { summary, category, clusterMatch };
  } catch {
    return null;
  }
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Env var helper that treats empty strings (e.g. unset CI variables) as unset. */
function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveLlmConfig() {
  const directKey = env('LLM_API_KEY');
  const gatewayKey = env('AI_GATEWAY_API_KEY');
  const useGateway = !directKey && Boolean(gatewayKey);
  return {
    baseUrl:
      env('LLM_BASE_URL') ??
      (useGateway ? 'https://ai-gateway.vercel.sh/v1' : 'https://api.deepseek.com'),
    apiKey: directKey ?? gatewayKey ?? '',
    model: env('LLM_MODEL') ?? (useGateway ? 'deepseek/deepseek-v3.1' : 'deepseek-chat'),
  };
}

export const config = {
  port: Number(process.env.PORT ?? 3600),
  host: process.env.HOST ?? '0.0.0.0',
  // Postgres connection string (Neon/Vercel/any). Empty = embedded PGlite in dataDir.
  databaseUrl: process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '',
  dataDir: process.env.DATA_DIR ?? path.resolve(here, '../../data/pg'),
  webDist: process.env.WEB_DIST ?? path.resolve(here, '../../web/dist'),
  // Any OpenAI-compatible provider works. Preferred setup: Vercel AI Gateway
  // (AI_GATEWAY_API_KEY) — one key, models switchable via LLM_MODEL slugs like
  // "deepseek/deepseek-v3.1" or "anthropic/claude-haiku-4.5". A direct
  // provider key via LLM_API_KEY (+ LLM_BASE_URL/LLM_MODEL) still works and
  // takes precedence when both are set.
  llm: resolveLlmConfig(),
  scrape: {
    intervalMinutes: Number(process.env.SCRAPE_INTERVAL_MINUTES ?? 30),
    userAgent:
      process.env.SCRAPE_USER_AGENT ??
      'Mozilla/5.0 (compatible; EchappeeReader/0.1; personal news reader)',
    // Delay between article fetches to the same host.
    perHostDelayMs: Number(process.env.SCRAPE_PER_HOST_DELAY_MS ?? 2000),
    maxItemsPerSourcePerRun: Number(process.env.SCRAPE_MAX_ITEMS ?? 25),
    // Per-page fetch timeout for article extraction.
    fetchTimeoutMs: Number(process.env.SCRAPE_FETCH_TIMEOUT_MS ?? 25_000),
  },
};

export function llmEnabled(): boolean {
  return config.llm.apiKey.length > 0;
}

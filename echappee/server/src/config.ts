import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT ?? 3600),
  host: process.env.HOST ?? '0.0.0.0',
  dbPath: process.env.DB_PATH ?? path.resolve(here, '../../data/echappee.db'),
  webDist: process.env.WEB_DIST ?? path.resolve(here, '../../web/dist'),
  // Any OpenAI-compatible provider works; DeepSeek is the default.
  llm: {
    baseUrl: process.env.LLM_BASE_URL ?? 'https://api.deepseek.com',
    apiKey: process.env.LLM_API_KEY ?? '',
    model: process.env.LLM_MODEL ?? 'deepseek-chat',
  },
  scrape: {
    intervalMinutes: Number(process.env.SCRAPE_INTERVAL_MINUTES ?? 30),
    userAgent:
      process.env.SCRAPE_USER_AGENT ??
      'Mozilla/5.0 (compatible; EchappeeReader/0.1; personal news reader)',
    // Delay between article fetches to the same host.
    perHostDelayMs: Number(process.env.SCRAPE_PER_HOST_DELAY_MS ?? 2000),
    maxItemsPerSourcePerRun: Number(process.env.SCRAPE_MAX_ITEMS ?? 25),
  },
};

export function llmEnabled(): boolean {
  return config.llm.apiKey.length > 0;
}

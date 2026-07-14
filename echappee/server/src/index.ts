import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import cron from 'node-cron';
import fs from 'node:fs';
import { config, llmEnabled } from './config.js';
import { getDb } from './db.js';
import { registerApi } from './routes/api.js';
import { refreshAll } from './pipeline/refresh.js';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
const db = getDb();

registerApi(app, db);

// Serve the built PWA when present (production / Docker).
if (fs.existsSync(config.webDist)) {
  await app.register(fastifyStatic, { root: config.webDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
    return reply.sendFile('index.html');
  });
} else {
  app.log.warn(`web dist not found at ${config.webDist} — API only (run \`npm run build -w web\`)`);
}

cron.schedule(`*/${config.scrape.intervalMinutes} * * * *`, () => {
  void refreshAll(db)
    .then((stats) => app.log.info({ totalNew: stats.totalNew }, 'scheduled refresh done'))
    .catch((err) => app.log.error(err, 'scheduled refresh failed'));
});

await app.listen({ port: config.port, host: config.host });
app.log.info(
  `Échappée up on :${config.port} — LLM ${llmEnabled() ? `enabled (${config.llm.model})` : 'disabled (set LLM_API_KEY)'}`
);

// Kick off an initial refresh in the background so a fresh install has content.
if (process.env.REFRESH_ON_BOOT !== '0') {
  void refreshAll(db)
    .then((stats) => app.log.info({ totalNew: stats.totalNew }, 'boot refresh done'))
    .catch((err) => app.log.error(err, 'boot refresh failed'));
}

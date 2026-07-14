// Vercel serverless entrypoint: one catch-all function hosting the whole
// Fastify API. Imports the compiled server (built by `npm run build` during
// the Vercel build step) so no TS resolution happens at bundle time.
import Fastify from 'fastify';
import { getDb } from '../server/dist/db.js';
import { registerApi } from '../server/dist/routes/api.js';

const app = Fastify({ logger: false });

const ready = (async () => {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    throw new Error(
      'DATABASE_URL is not set. Connect a Postgres database (Vercel → Storage → Neon) to this project and redeploy.'
    );
  }
  registerApi(app, await getDb());
  await app.ready();
})();

export default async function handler(req, res) {
  try {
    await ready;
  } catch (err) {
    // Surface the real problem instead of a generic function crash.
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    return;
  }
  app.server.emit('request', req, res);
}

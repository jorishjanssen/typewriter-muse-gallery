// Vercel serverless entrypoint: one catch-all function hosting the whole
// Fastify API. Imports the compiled server (built by `npm run build` during
// the Vercel build step) so no TS resolution happens at bundle time.
import Fastify from 'fastify';
import { getDb } from '../server/dist/db.js';
import { registerApi } from '../server/dist/routes/api.js';

const app = Fastify({ logger: false });

const ready = (async () => {
  registerApi(app, await getDb());
  await app.ready();
})();

export default async function handler(req, res) {
  await ready;
  app.server.emit('request', req, res);
}

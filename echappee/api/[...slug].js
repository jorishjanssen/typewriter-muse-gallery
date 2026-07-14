// Vercel serverless entrypoint: one catch-all function hosting the whole
// Fastify API (compiled to server/dist by `npm run build` during the Vercel
// build). Startup runs inside a caught async block so failures surface as
// JSON 500s, and a FAILED startup is retried on the next request — Neon's
// free tier sleeps when idle, and one connect timeout during a cold start
// must not permanently brick a warm function instance.
let app = null;
let initPromise = null;

function init() {
  initPromise ??= (async () => {
    if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
      throw new Error(
        'DATABASE_URL is not set. Connect a Postgres database (Vercel → Storage → Neon) to this project and redeploy.'
      );
    }
    const { default: Fastify } = await import('fastify');
    const { getDb } = await import('../server/dist/db.js');
    const { registerApi } = await import('../server/dist/routes/api.js');
    const instance = Fastify({ logger: false });
    registerApi(instance, await getDb());
    await instance.ready();
    app = instance;
  })().catch((err) => {
    initPromise = null;
    throw err;
  });
  return initPromise;
}

export default async function handler(req, res) {
  try {
    await init();
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: String(err?.stack ?? err) }));
    return;
  }
  app.server.emit('request', req, res);
}

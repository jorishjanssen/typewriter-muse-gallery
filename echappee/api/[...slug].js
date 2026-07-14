// Vercel serverless entrypoint: one catch-all function hosting the whole
// Fastify API (compiled to server/dist by `npm run build` during the Vercel
// build). Everything is loaded inside a caught async block so that ANY
// startup failure — missing env, missing module, DB unreachable — surfaces
// as a JSON 500 with the real reason instead of FUNCTION_INVOCATION_FAILED.
let app = null;
let startupError = null;

const ready = (async () => {
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
  startupError = err;
});

export default async function handler(req, res) {
  await ready;
  if (!app) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        error: String(startupError?.stack ?? startupError ?? 'startup failed'),
      })
    );
    return;
  }
  app.server.emit('request', req, res);
}

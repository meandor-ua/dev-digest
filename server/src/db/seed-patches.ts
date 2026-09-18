/** Stored diffs for the demo PR #482's `pr_files` rows. `additions` / `deletions`
 *  are derived from each patch so a row can never disagree with its own hunks.
 *  The hunks contain the exact lines the seeded findings cite
 *  (src/config.ts:12, src/api/users.ts:45-52) so the citation-grounding gate
 *  can anchor findings on a real run. */

const lines = (...l: string[]) => l.join('\n');

export const PR_482_PATCHES: Array<{ path: string; patch: string }> = [
  {
    path: 'src/middleware/ratelimit.ts',
    patch: lines(
      '@@ -0,0 +1,23 @@',
      "+import type { FastifyReply, FastifyRequest } from 'fastify';",
      '+',
      '+const WINDOW_MS = 60_000;',
      '+const MAX_REQUESTS = 100;',
      '+',
      '+const buckets = new Map<string, { count: number; resetAt: number }>();',
      '+',
      '+export async function rateLimit(req: FastifyRequest, reply: FastifyReply) {',
      '+  const now = Date.now();',
      '+  const key = req.ip;',
      '+  let bucket = buckets.get(key);',
      '+  if (!bucket || bucket.resetAt <= now) {',
      '+    bucket = { count: 0, resetAt: now + WINDOW_MS };',
      '+    buckets.set(key, bucket);',
      '+  }',
      '+  bucket.count += 1;',
      '+  if (bucket.count > MAX_REQUESTS) {',
      "+    reply.header('retry-after', Math.ceil((bucket.resetAt - now) / 1000));",
      "+    return reply.code(429).send({ error: 'rate_limited' });",
      '+  }',
      '+}',
      '+',
      '+export const _buckets = buckets;',
    ),
  },
  {
    path: 'src/api/public/webhooks.ts',
    patch: lines(
      '@@ -18,6 +18,8 @@ export async function webhookRoutes(app: FastifyInstance) {',
      '   app.post(\'/webhooks/stripe\', async (req, reply) => {',
      '-    const event = req.body as StripeEvent;',
      '-    await handleEvent(event);',
      '-    return { ok: true };',
      '+    const signature = req.headers[\'stripe-signature\'];',
      '+    if (typeof signature !== \'string\') return reply.code(400).send({ error: \'missing_signature\' });',
      '+    const event = verifyStripeEvent(req.rawBody, signature);',
      '+    await handleEvent(event);',
      '+    return { ok: true };',
      '   });',
      ' });',
    ),
  },
  {
    path: 'src/config.ts',
    patch: lines(
      '@@ -9,3 +9,7 @@ export const config = {',
      '   port: Number(process.env.PORT ?? 3000),',
      '   env: process.env.NODE_ENV ?? \'development\',',
      '   logLevel: process.env.LOG_LEVEL ?? \'info\',',
      "+  stripeSecretKey: 'sk_live_REDACTED_DEMO',",
      '+  rateLimitWindowMs: 60_000,',
      '+  rateLimitMax: 100,',
      '+  publicApiPrefix: \'/public\',',
    ),
  },
  {
    path: 'src/api/users.ts',
    patch: lines(
      '@@ -43,5 +43,11 @@ export async function usersRoutes(app: FastifyInstance) {',
      '   app.get(\'/users\', async () => {',
      '     const users = await db.select().from(usersTable);',
      '-    return users;',
      '-  });',
      '+    const result = [];',
      '+    for (const user of users) {',
      '+      const orders = await db.select().from(ordersTable).where(eq(ordersTable.userId, user.id));',
      '+      result.push({ ...user, orderCount: orders.length });',
      '+    }',
      '+    return result;',
      '+  });',
      '+',
      ' });',
    ),
  },
];

export function patchStats(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const l of patch.split('\n')) {
    if (l.startsWith('@@')) continue;
    if (l.startsWith('+')) additions += 1;
    else if (l.startsWith('-')) deletions += 1;
  }
  return { additions, deletions };
}

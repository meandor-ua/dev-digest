import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionStatus, type Provider } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ConventionsRepository } from './repository.js';
import { ConventionsService } from './service.js';
import { EXTRACT_RATE_LIMIT } from './constants.js';

// Evidence (path/lines/snippet) is sliced from the real file at scan time and is
// deliberately NOT editable. An empty body is rejected here: Drizzle's
// `.set({})` throws, which would otherwise surface as a 500.
const PatchConventionBody = z
  .object({
    rule: z.string().trim().min(1).max(2000).optional(),
    rationale: z.string().max(2000).nullable().optional(),
    status: ConventionStatus.optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Provide at least one of rule, rationale, status',
  });

/**
 * Conventions Extractor:
 *   GET    /repos/:id/conventions          → candidates for the repo
 *   POST   /repos/:id/conventions/extract  → scan (one model call)
 *   POST   /repos/:id/conventions/skill    → un-persisted skill draft from accepted
 *   PATCH  /conventions/:id                → accept / reject / edit
 *   DELETE /conventions/:id                → drop a candidate
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ConventionsService({
    conventions: new ConventionsRepository(container.db),
    repos: container.reposRepo,
    repoIntel: container.repoIntel,
    resolveLlm: async (workspaceId) => {
      const { provider, model } = await resolveFeatureModel(container, workspaceId, 'conventions');
      return { llm: await container.llm(provider as Provider), model };
    },
  });

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams }, config: { rateLimit: EXTRACT_RATE_LIMIT } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.post('/repos/:id/conventions/skill', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.draftSkill(workspaceId, req.params.id);
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: PatchConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const updated = await service.patch(workspaceId, req.params.id, req.body);
      if (!updated) throw new NotFoundError('Convention not found');
      return updated;
    },
  );

  app.delete('/conventions/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Convention not found');
    return { ok: true };
  });
}

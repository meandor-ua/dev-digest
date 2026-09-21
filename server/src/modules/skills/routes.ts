import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillType, SkillSource } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';
import { SKILL_BODY_MAX, SKILL_DESCRIPTION_MAX, SKILL_NAME_MAX } from './constants.js';

const CreateSkillBody = z.object({
  name: z.string().min(1).max(SKILL_NAME_MAX),
  description: z.string().max(SKILL_DESCRIPTION_MAX).optional(),
  type: SkillType,
  source: SkillSource.optional(),
  body: z.string().max(SKILL_BODY_MAX),
  enabled: z.boolean().optional(),
  evidence_files: z.array(z.string()).optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).max(SKILL_NAME_MAX).optional(),
  description: z.string().max(SKILL_DESCRIPTION_MAX).optional(),
  type: SkillType.optional(),
  source: SkillSource.optional(),
  body: z.string().max(SKILL_BODY_MAX).optional(),
  enabled: z.boolean().optional(),
  evidence_files: z.array(z.string()).optional(),
});

const ImportSkillBody = z.object({
  url: z.string().url(),
  name: z.string().optional(),
  type: SkillType.optional(),
});

const RestoreSkillBody = z.object({
  version: z.coerce.number().int().positive(),
});

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const body = req.body;
    const skill = await service.create(workspaceId, {
      name: body.name,
      description: body.description,
      type: body.type,
      source: body.source,
      body: body.body,
      enabled: body.enabled,
      evidence_files: body.evidence_files,
    });
    reply.status(201);
    return skill;
  });

  // Statically registered before `/skills/:id` to avoid routing collisions
  app.post(
    '/skills/import',
    { schema: { body: ImportSkillBody }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.importFromUrl(
        workspaceId,
        req.body.url,
        req.body.name,
        req.body.type,
      );
      reply.status(201);
      return skill;
    },
  );

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const stats = await service.stats(workspaceId, req.params.id);
    if (!stats) throw new NotFoundError('Skill not found');
    return stats;
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.post(
    '/skills/:id/restore',
    { schema: { params: IdParams, body: RestoreSkillBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const restored = await service.restore(workspaceId, req.params.id, req.body.version);
      if (!restored) throw new NotFoundError('Skill or version not found');
      return restored;
    },
  );
}

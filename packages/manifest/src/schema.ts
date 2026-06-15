import { z } from 'zod';

/**
 * SDK capabilities a plugin may declare. Mirrors the `Permission` union in
 * SRS §5. Several are reserved for post-v1 (storage, notifications, events,
 * cross-plugin data sharing — `data:provide` / `data:consume`, RFC 0002 — and
 * the activity log — `activity:write`, RFC 0005).
 */
export const permissionSchema = z.enum([
  'auth:session',
  'db:readWrite',
  'db:readOnly',
  'mailer:send',
  'storage:readWrite',
  'notifications:send',
  'events:publish',
  'events:subscribe',
  'data:provide',
  'data:consume',
  'activity:write',
  'admin:*',
]);

/**
 * The plugin manifest schema — the single source of truth for both runtime
 * validation and the exported TypeScript types (see ./types). Mirrors
 * SRS §5 Plugin Manifest Reference.
 *
 * `.strict()` rejects unknown keys so manifest typos fail the build rather than
 * being silently ignored. Forward compatibility is handled by `schemaVersion`.
 */
const manifestObjectSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1),
    description: z.string().optional(),
    database: z.enum(['shared', 'isolated']).optional(),
    type: z.enum(['platform', 'sovereign', 'community']),
    runtime: z.enum(['native', 'static', 'iframe-local', 'iframe-remote', 'external']),
    routePrefix: z.string().min(1).startsWith('/', 'routePrefix must start with "/"'),
    permissions: z.array(permissionSchema),
    shell: z.enum(['default', 'minimal']).optional(),
    adminOnly: z.boolean().optional(),
    apiProvider: z.boolean().optional(),
    icon: z.string().optional(),
    compatibility: z.object({
      minPlatformVersion: z.string().min(1),
    }),
    repository: z.string().url().optional(),
  })
  .strict();

export const manifestSchema = manifestObjectSchema.refine(
  (m) => m.type === 'platform' || m.repository !== undefined,
  {
    message: 'repository is required when type is "sovereign" or "community"',
    path: ['repository'],
  },
);

/**
 * Manifest field names, sourced from the schema so docs and tooling share one
 * source of truth (e.g. the docs-parity test that asserts every field is
 * documented in `docs/plugin-development.md`). Order matches the schema.
 */
export const manifestFieldNames: string[] = Object.keys(manifestObjectSchema.shape);

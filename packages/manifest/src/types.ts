import type { z } from 'zod';
import type { manifestSchema, permissionSchema, registryEntrySchema } from './schema';

/** A plugin manifest, inferred from the Zod schema (single source of truth). */
export type SovereignManifest = z.infer<typeof manifestSchema>;

/** An SDK capability a plugin may declare. */
export type Permission = z.infer<typeof permissionSchema>;

/** A public-registry entry (thin pointer + display metadata), inferred from the schema. */
export type RegistryEntry = z.infer<typeof registryEntrySchema>;

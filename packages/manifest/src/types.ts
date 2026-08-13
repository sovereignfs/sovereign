import type { z } from 'zod';
import type {
  manifestSchema,
  permissionSchema,
  registryEntrySchema,
  surfaceSchema,
} from './schema';

/** A plugin manifest, inferred from the Zod schema (single source of truth). */
export type SovereignManifest = z.infer<typeof manifestSchema>;

/** An SDK capability a plugin may declare. */
export type Permission = z.infer<typeof permissionSchema>;

/** A surface a plugin can declare availability on (RFC 0080). */
export type Surface = z.infer<typeof surfaceSchema>;

/** A public-registry entry (thin pointer + display metadata), inferred from the schema. */
export type RegistryEntry = z.infer<typeof registryEntrySchema>;

/** One manifest-declared plugin flow handoff receiver (RFC 0053). */
export type HandoffReceiverDeclaration = NonNullable<
  NonNullable<SovereignManifest['handoffs']>['receives']
>[number];

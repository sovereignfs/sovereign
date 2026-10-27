import { ConfigError } from '@sovereignfs/config';
import { getConfig } from './config';

/**
 * Reads and validates the whole configuration. On a problem it prints every one and
 * stops the process with a non-zero exit, rather than serve with a missing or weak
 * secret. Node.js only: `instrumentation.ts` imports it behind a runtime check.
 */
export function validateConfigOrExit(): void {
  try {
    getConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`\n${error.message}\n\nSee apps/core/.env.example for every variable.\n`);
      process.exit(1);
    }
    throw error;
  }
}

import { ConfigError } from '@sovereignfs/config';
import { getConfig, getDatabaseSettings, getFieldCipher } from './config';

/**
 * Reads and validates the whole configuration. On a problem it prints every one and
 * stops the process with a non-zero exit, rather than serve with a missing or weak
 * secret. Node.js only: `instrumentation.ts` imports it behind a runtime check.
 */
export function validateConfigOrExit(): void {
  try {
    getConfig();
    // Which database, and what its dialect needs: a missing address is a start-up error.
    getDatabaseSettings();
    // A key ring that is set but wrong is an error even though none is required yet, so a
    // typo never turns encryption off.
    getFieldCipher();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`\n${error.message}\n\nSee apps/core/.env.example for every variable.\n`);
      process.exit(1);
    }
    throw error;
  }
}

import { createHash } from 'node:crypto';
import { PRIVACY, TERMS } from './content';

/**
 * Identifies the exact text a person accepted: a digest of both documents as they are built. There
 * is no number to forget to raise; any change to the wording is a new version.
 */
export const legalVersion: string = createHash('sha256')
  .update(JSON.stringify([PRIVACY, TERMS]))
  .digest('hex');

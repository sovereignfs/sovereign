import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * What the steps of the run know about the instance, kept in a file so that it survives a worker restarting after a
 * failure: ids the Console gave, secrets shown once, the invitation link. The file is emptied when a run starts.
 */
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '../.world.json');

const read = (): Record<string, unknown> =>
  existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : {};

export const world = {
  reset(): void {
    rmSync(file, { force: true });
  },
  set(key: string, value: unknown): void {
    writeFileSync(file, JSON.stringify({ ...read(), [key]: value }, null, 2));
  },
  get<T>(key: string): T {
    const found = read()[key];
    if (found === undefined)
      throw new Error(`The run has not recorded ${key} yet: an earlier step did not pass.`);
    return found as T;
  },
};

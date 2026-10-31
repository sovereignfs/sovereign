import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { Locked } from '../errors.js';
import type { Host } from './host.js';

/**
 * One run at a time (operator-cli §6.3). A run that cannot take the lock exits as locked, without waiting, and a lock left by a
 * process that has gone does not block the next run. The lock is a file made with exclusive creation, so two runs cannot both make it.
 */
export async function withLock<T>(file: string, host: Host, work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await writeFile(file, `${host.pid}\n${new Date(host.now()).toISOString()}\n`, {
        flag: 'wx',
        mode: 0o600,
      });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const holder = Number((await readFile(file, 'utf8').catch(() => '')).split('\n')[0]);
      if (attempt === 0 && Number.isInteger(holder) && holder > 0 && !host.alive(holder)) {
        // Whoever made it is gone: take it over, once.
        await rm(file, { force: true });
        continue;
      }
      throw new Locked(
        'Another deployment is running on this server.',
        'Wait for it to finish, then run sv deploy again. sv logs shows how it is going.',
      );
    }
  }
  try {
    return await work();
  } finally {
    if (existsSync(file)) await rm(file, { force: true });
  }
}

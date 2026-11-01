import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeAtomically } from '../suite/files.js';

/** What the server remembers of what it applied (operator-cli §7). It holds no secret. */
export type State = {
  schema: 1;
  /** The commit `current` points at. */
  commit: string;
  /** The commit that ran before it, which `sv rollback` goes back to. */
  previous?: string;
  appliedAt: string;
  core: { version: string; image: string; healthy: boolean };
  /** The `max_connections` it applied, so a change can be said before the server restarts. Absent in a file from before it was recorded. */
  database: { version: string; maxConnections?: number };
  tls: 'per-host' | 'internal';
  /** The names of the operator's secrets written for each owner, so one removed from secrets.age.yml is removed from the server. */
  operatorSecrets?: Record<string, string[]>;
  /** For each hosted or external app: what the server made for it. Filled by the app steps. */
  apps: Record<
    string,
    {
      kind: 'hosted' | 'external';
      clientId?: string;
      database?: string;
      role?: string;
      version?: string;
      healthy?: boolean;
    }
  >;
};

export const STATE_FILE = 'state.json';

/** The directories and files under the server's state directory (operator-cli §7). */
export function layout(stateDir: string) {
  return {
    releases: path.join(stateDir, 'releases'),
    current: path.join(stateDir, 'current'),
    secrets: path.join(stateDir, 'secrets'),
    backups: path.join(stateDir, 'backups'),
    pki: path.join(stateDir, 'pki'),
    proxy: path.join(stateDir, 'proxy'),
    state: path.join(stateDir, STATE_FILE),
    ageKey: path.join(stateDir, 'age.key'),
    lock: path.join(stateDir, 'lock'),
  };
}

export async function readState(stateDir: string): Promise<State | undefined> {
  const file = layout(stateDir).state;
  if (!existsSync(file)) return undefined;
  return JSON.parse(await readFile(file, 'utf8')) as State;
}

export async function writeState(stateDir: string, state: State): Promise<void> {
  await writeAtomically(layout(stateDir).state, `${JSON.stringify(state, null, 2)}\n`);
}

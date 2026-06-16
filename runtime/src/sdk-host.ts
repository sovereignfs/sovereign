import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  findWorkspaceRoot,
  getDefaultTenant,
  getPlatformDb,
  getPlatformSetting,
} from '@sovereignfs/db';
import { createMailer } from '@sovereignfs/mailer';
import { provideHost } from '@sovereignfs/sdk';

let _version: string | undefined;

/**
 * The platform version from the workspace root package.json (tracks roadmap
 * milestones). Read once per process; '0.0.0' when the root manifest is
 * unreadable (standalone / Docker contexts where findWorkspaceRoot falls back
 * to cwd and package.json may not be at the root).
 */
function getPlatformVersion(): string {
  if (_version) return _version;
  try {
    const raw = readFileSync(join(findWorkspaceRoot(), 'package.json'), 'utf8');
    _version = (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    _version = '0.0.0';
  }
  return _version;
}

const _mailer = createMailer();

provideHost({
  db: {
    async getClient() {
      return (await getPlatformDb()).db;
    },
  },
  mailer: {
    async send(options) {
      return _mailer.send(options);
    },
  },
  platform: {
    async getConfig() {
      const db = await getPlatformDb();
      const [tenant, inviteOnly] = await Promise.all([
        getDefaultTenant(db),
        getPlatformSetting(db, 'invite_only'),
      ]);
      return {
        tenantName: tenant.name,
        inviteOnly: inviteOnly === 'true',
        version: getPlatformVersion(),
      };
    },
  },
});

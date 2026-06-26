import { sdk } from '@sovereignfs/sdk';
import { getInstalledPlugins } from '@/src/registry';
import { EntitlementsSection, type EntitlementRow } from './EntitlementsSection';
import { LicenseGenerator, type GeneratorPlugin, type GeneratorUser } from './LicenseGenerator';
import styles from '../console.module.css';

interface MemberRow {
  id: string | null;
  email: string;
  name: string | null;
  status: 'active' | 'deactivated' | 'invited';
}

const RUNTIME_URL = `http://localhost:${process.env.PORT ?? '3000'}`;
const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';

async function loadEntitlements(): Promise<EntitlementRow[]> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  try {
    const res = await fetch(`${RUNTIME_URL}/api/admin/entitlements`, {
      headers: { authorization: `Bearer ${adminKey}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { entitlements: EntitlementRow[] };
    return data.entitlements;
  } catch {
    return [];
  }
}

async function loadStoredKeys(): Promise<{
  keys: Record<string, string>;
  publicKeys: Record<string, string>;
}> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  try {
    const res = await fetch(`${RUNTIME_URL}/api/admin/license-keys`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: 'no-store',
    });
    if (!res.ok) return { keys: {}, publicKeys: {} };
    const data = (await res.json()) as {
      keys: Record<string, string>;
      publicKeys: Record<string, string>;
    };
    return { keys: data.keys ?? {}, publicKeys: data.publicKeys ?? {} };
  } catch {
    return { keys: {}, publicKeys: {} };
  }
}

async function loadUsers(): Promise<MemberRow[]> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  try {
    const res = await fetch(`${AUTH_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return (await res.json()) as MemberRow[];
  } catch {
    return [];
  }
}

export default async function EntitlementsPage() {
  const [rows, session] = await Promise.all([loadEntitlements(), sdk.auth.getSession()]);
  const isOwner = sdk.auth.hasCapability(session, 'role:assign');

  let generatorPlugins: GeneratorPlugin[] = [];
  let generatorUsers: GeneratorUser[] = [];
  let storedKeys: Record<string, string> = {};
  let storedPublicKeys: Record<string, string> = {};

  if (isOwner) {
    const [members, { keys, publicKeys }] = await Promise.all([loadUsers(), loadStoredKeys()]);
    storedKeys = keys;
    storedPublicKeys = publicKeys;
    generatorPlugins = getInstalledPlugins().flatMap((p) => {
      const publicKey = p.monetization?.license?.publicKey;
      if (!publicKey) return [];
      return [{ id: p.id, name: p.name, publicKey, tiers: p.monetization?.tiers ?? [] }];
    });
    generatorUsers = members.flatMap((m) => {
      if (!m.id || m.status === 'invited') return [];
      return [{ id: m.id, email: m.email, name: m.name }];
    });
  }

  return (
    <div className={styles.sections}>
      <EntitlementsSection rows={rows} isOwner={isOwner} />

      {isOwner && generatorPlugins.length > 0 && (
        <section className={styles.section}>
          <LicenseGenerator
            plugins={generatorPlugins}
            users={generatorUsers}
            storedKeys={storedKeys}
            storedPublicKeys={storedPublicKeys}
          />
        </section>
      )}
    </div>
  );
}

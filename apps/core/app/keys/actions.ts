'use server';

import { requireCapability } from '../../src/auth/authorize';
import { getDatabase } from '../../src/database';
import {
  KeyVault,
  VaultError,
  type VaultAccount,
  type VaultApp,
  type VaultWay,
  type VaultWayIn,
} from '../../src/keys/vault';

/**
 * The key vault, for the signed-in person's own account (core-app §5.3). Each action is a public endpoint whatever the page around
 * it checks, so each asks for the capability itself and acts on the session's account, never one named in a request. What it
 * stores, core cannot open; what it returns are the person's own wrapped keys.
 */

export type VaultResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

const vault = async () => new KeyVault(await getDatabase());

async function attempt<T>(run: () => Promise<T>): Promise<VaultResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (error instanceof VaultError) return { ok: false, error: error.message };
    throw error;
  }
}

/** The account's keys and ways in, and whose they are (the `sub` every record is bound to). */
export async function readVaultAction(): Promise<
  VaultResult<{ sub: string; account?: VaultAccount; waysIn: VaultWayIn[] }>
> {
  const session = await requireCapability('profile:manage');
  return attempt(async () => ({
    sub: session.user.id,
    ...(await (await vault()).read(session.user.id)),
  }));
}

export async function setUpVaultAction(
  account: Omit<VaultAccount, 'kitConfirmed'>,
  waysIn: VaultWayIn[],
): Promise<VaultResult> {
  const session = await requireCapability('profile:manage');
  return attempt(async () => {
    await (await vault()).setUp(session.user.id, account, waysIn);
    return undefined;
  });
}

export async function putWayInAction(wayIn: VaultWayIn): Promise<VaultResult> {
  const session = await requireCapability('profile:manage');
  return attempt(async () => {
    await (await vault()).putWayIn(session.user.id, wayIn);
    return undefined;
  });
}

export async function removeWayInAction(way: VaultWay, id: string): Promise<VaultResult<boolean>> {
  const session = await requireCapability('profile:manage');
  return attempt(async () => (await vault()).removeWayIn(session.user.id, way, id));
}

export async function confirmKitAction(record: string): Promise<VaultResult> {
  const session = await requireCapability('profile:manage');
  return attempt(async () => {
    await (await vault()).confirmKit(session.user.id, record);
    return undefined;
  });
}

export async function readAppKeysAction(
  clientId: string,
): Promise<VaultResult<VaultApp | undefined>> {
  const session = await requireCapability('profile:manage');
  return attempt(async () => (await vault()).app(session.user.id, clientId));
}

export async function putAppKeysAction(app: VaultApp): Promise<VaultResult> {
  const session = await requireCapability('profile:manage');
  return attempt(async () => {
    await (await vault()).putApp(session.user.id, app);
    return undefined;
  });
}

/** This session's secret (core-app §5.4): given to this session alone, while it is live. */
export async function sessionSecretAction(): Promise<VaultResult<string | undefined>> {
  const session = await requireCapability('profile:manage');
  return attempt(async () => (await vault()).sessionSecret(session.session.id, session.user.id));
}

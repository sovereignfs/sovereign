import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createConsentGrant, listConsentGrants, type ConsentGrantRow } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';
import { getInstalledPlugins } from '@/src/registry';

function currentUserId(request: Request): string | null {
  return request.headers.get('x-sovereign-user-id');
}

export interface PendingDataGrantRequest {
  consumerId: string;
  consumerName: string;
  providerId: string;
  providerName: string;
  contract: string;
  version: number;
  /** From the provider's own manifest (`data.provides[].description`) — never plugin-supplied at request time. */
  description: string | null;
}

/**
 * Every (consumer, provider, contract, version) triple declared in an
 * installed plugin's own manifest (`data.consumes`) that the user hasn't
 * already granted or been offered — computed from manifests, not from
 * anything a plugin sends at request time, so the description shown here is
 * always the provider's own declared, install-time-reviewed text (RFC 0002 §4).
 */
function findPendingDataGrantRequests(
  existingGrants: ConsentGrantRow[],
): PendingDataGrantRequest[] {
  const installed = getInstalledPlugins();
  const byId = new Map(installed.map((p) => [p.id, p]));
  const granted = new Set(
    existingGrants.map((g) => `${g.consumerId}:${g.providerId}:${g.contract}:${g.version}`),
  );

  const pending: PendingDataGrantRequest[] = [];
  for (const consumer of installed) {
    for (const want of consumer.data?.consumes ?? []) {
      const key = `${consumer.id}:${want.providerId}:${want.contract}:${want.version}`;
      if (granted.has(key)) continue;
      const provider = byId.get(want.providerId);
      const provided = provider?.data?.provides?.find(
        (p) => p.contract === want.contract && p.version === want.version,
      );
      if (!provider || !provided) continue; // declared but the provider side isn't real — nothing to offer
      pending.push({
        consumerId: consumer.id,
        consumerName: consumer.name,
        providerId: provider.id,
        providerName: provider.name,
        contract: want.contract,
        version: want.version,
        description: provided.description ?? null,
      });
    }
  }
  return pending;
}

/** True when (consumerId, providerId, contract, version) matches a real, installed manifest declaration on both sides. */
function isDeclaredDataContract(
  consumerId: string,
  providerId: string,
  contract: string,
  version: number,
): boolean {
  const installed = getInstalledPlugins();
  const consumer = installed.find((p) => p.id === consumerId);
  const provider = installed.find((p) => p.id === providerId);
  if (!consumer || !provider) return false;
  const consumes = consumer.data?.consumes?.some(
    (c) => c.providerId === providerId && c.contract === contract && c.version === version,
  );
  const provides = provider.data?.provides?.some(
    (p) => p.contract === contract && p.version === version,
  );
  return Boolean(consumes && provides);
}

/** List the current user's active consent grants and any pending requests (RFC 0002). */
export async function GET(request: Request): Promise<Response> {
  const userId = currentUserId(request);
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const grants = await listConsentGrants(await getPlatformDb(), userId);
  const pending = findPendingDataGrantRequests(grants);
  return NextResponse.json({ grants, pending });
}

/**
 * Grant consent for a (consumer, provider, contract, version) tuple (RFC 0002).
 *
 * Validated against real, installed manifest declarations on both sides —
 * this is the platform's own consent-integrity check, independent of and in
 * addition to whatever UI a caller used to get here. A grant for a triple
 * that doesn't match a real `data.provides`/`data.consumes` pair is refused:
 * consent can't be informed about a relationship that doesn't exist.
 */
export async function POST(request: Request): Promise<Response> {
  const userId = currentUserId(request);
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await request.json()) as {
    consumerId?: unknown;
    providerId?: unknown;
    contract?: unknown;
    version?: unknown;
  };

  const { consumerId, providerId, contract, version } = body;
  if (
    typeof consumerId !== 'string' ||
    typeof providerId !== 'string' ||
    typeof contract !== 'string' ||
    typeof version !== 'number'
  ) {
    return NextResponse.json(
      { error: 'consumerId, providerId, contract (string) and version (number) are required' },
      { status: 400 },
    );
  }

  if (!isDeclaredDataContract(consumerId, providerId, contract, version)) {
    return NextResponse.json(
      {
        error:
          'No installed plugin declares this data-sharing relationship in its manifest — refusing to create an undeclared grant.',
      },
      { status: 400 },
    );
  }

  const id = randomUUID();
  await createConsentGrant(
    await getPlatformDb(),
    id,
    userId,
    consumerId,
    providerId,
    contract,
    version,
  );
  return NextResponse.json({ id }, { status: 201 });
}

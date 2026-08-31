import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Route-level test: exercises the actual GET/POST handlers — manifest-backed
// pending-request computation and the POST validation gate that refuses to
// create a grant for a triple no installed plugin actually declares.
vi.mock('@sovereignfs/db', () => ({
  createConsentGrant: vi.fn(async () => {}),
  listConsentGrants: vi.fn(async () => []),
}));
vi.mock('@/src/db', () => ({ getPlatformDb: vi.fn(async () => ({})) }));
vi.mock('@/src/registry', () => ({ getInstalledPlugins: vi.fn(() => []) }));

import { createConsentGrant, listConsentGrants } from '@sovereignfs/db';
import { getInstalledPlugins } from '@/src/registry';
import { GET, POST } from '../../app/api/account/data-grants/route';

const LEDGER = {
  id: 'fs.sovereign.ledger',
  name: 'Ledger',
  data: { consumes: [{ providerId: 'fs.sovereign.docs', contract: 'docs.read', version: 1 }] },
};
const DOCS = {
  id: 'fs.sovereign.docs',
  name: 'Docs',
  data: {
    provides: [
      { contract: 'docs.read', version: 1, description: 'Titles and folder structure only.' },
    ],
  },
};

function getRequest(): Request {
  return new Request('http://localhost/api/account/data-grants', {
    headers: { 'x-sovereign-user-id': 'u1' },
  });
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/account/data-grants', {
    method: 'POST',
    headers: { 'x-sovereign-user-id': 'u1', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/account/data-grants', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await GET(new Request('http://localhost/api/account/data-grants'));
    expect(res.status).toBe(401);
  });

  it('lists a declared, ungranted (consumer, provider, contract) triple as pending, with the provider-declared description', async () => {
    vi.mocked(getInstalledPlugins).mockReturnValue([LEDGER, DOCS] as never);

    const res = await GET(getRequest());
    const body = (await res.json()) as { pending: unknown[] };

    expect(res.status).toBe(200);
    expect(body.pending).toEqual([
      {
        consumerId: 'fs.sovereign.ledger',
        consumerName: 'Ledger',
        providerId: 'fs.sovereign.docs',
        providerName: 'Docs',
        contract: 'docs.read',
        version: 1,
        description: 'Titles and folder structure only.',
      },
    ]);
  });

  it('excludes a triple that already has an active grant', async () => {
    vi.mocked(getInstalledPlugins).mockReturnValue([LEDGER, DOCS] as never);
    vi.mocked(listConsentGrants).mockResolvedValue([
      {
        id: 'g1',
        userId: 'u1',
        consumerId: 'fs.sovereign.ledger',
        providerId: 'fs.sovereign.docs',
        contract: 'docs.read',
        version: 1,
        grantedAt: 1700000000,
      },
    ] as never);

    const res = await GET(getRequest());
    const body = (await res.json()) as { pending: unknown[] };
    expect(body.pending).toEqual([]);
  });

  it('excludes a consumer-declared triple whose provider plugin is not installed', async () => {
    vi.mocked(getInstalledPlugins).mockReturnValue([LEDGER] as never); // DOCS missing

    const res = await GET(getRequest());
    const body = (await res.json()) as { pending: unknown[] };
    expect(body.pending).toEqual([]);
  });

  it('excludes a consumer-declared triple the provider never actually provides (contract/version mismatch)', async () => {
    const docsV2 = {
      ...DOCS,
      data: { provides: [{ contract: 'docs.read', version: 2, description: 'v2' }] },
    };
    vi.mocked(getInstalledPlugins).mockReturnValue([LEDGER, docsV2] as never);

    const res = await GET(getRequest());
    const body = (await res.json()) as { pending: unknown[] };
    expect(body.pending).toEqual([]);
  });
});

describe('POST /api/account/data-grants', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await POST(
      new Request('http://localhost/api/account/data-grants', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(401);
    expect(createConsentGrant).not.toHaveBeenCalled();
  });

  it('rejects a malformed body', async () => {
    const res = await POST(postRequest({ consumerId: 'x' }));
    expect(res.status).toBe(400);
    expect(createConsentGrant).not.toHaveBeenCalled();
  });

  it('refuses to create a grant for a triple no installed plugin declares', async () => {
    vi.mocked(getInstalledPlugins).mockReturnValue([LEDGER, DOCS] as never);

    const res = await POST(
      postRequest({
        consumerId: 'fs.sovereign.ledger',
        providerId: 'fs.sovereign.docs',
        contract: 'docs.write', // not declared by either side
        version: 1,
      }),
    );

    expect(res.status).toBe(400);
    expect(createConsentGrant).not.toHaveBeenCalled();
  });

  it('creates a grant for a triple both sides actually declare', async () => {
    vi.mocked(getInstalledPlugins).mockReturnValue([LEDGER, DOCS] as never);

    const res = await POST(
      postRequest({
        consumerId: 'fs.sovereign.ledger',
        providerId: 'fs.sovereign.docs',
        contract: 'docs.read',
        version: 1,
      }),
    );

    expect(res.status).toBe(201);
    expect(createConsentGrant).toHaveBeenCalledWith(
      {},
      expect.any(String),
      'u1',
      'fs.sovereign.ledger',
      'fs.sovereign.docs',
      'docs.read',
      1,
    );
  });
});

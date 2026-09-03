import { beforeEach, describe, expect, it, vi } from 'vitest';

const connectionsCreate = vi.fn();
const connectionsList = vi.fn();
const secretsCreate = vi.fn();

vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    connections: {
      create: (...args: unknown[]) => connectionsCreate(...args),
      list: (...args: unknown[]) => connectionsList(...args),
    },
    secrets: {
      create: (...args: unknown[]) => secretsCreate(...args),
    },
  },
}));

const { createBackupDestination, listBackupDestinations } = await import('../backup-destinations');

function connectionRef(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'conn-1',
    scope: 'user',
    provider: 'git.custom',
    label: 'My backup repo',
    status: 'connected',
    secretRef: 'secret-1',
    metadata: {
      repoUrl: 'https://git.example.com/me/backups.git',
      branch: 'backups',
      authType: 'https-token',
      ageRecipient: 'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
    },
    lastCheckedAt: null,
    lastUsedAt: null,
    lastError: null,
    createdAt: 0,
    updatedAt: 0,
    disconnectedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listBackupDestinations', () => {
  it('maps connection refs to the plain destination view, never exposing the credential', async () => {
    connectionsList.mockResolvedValue([connectionRef()]);
    const result = await listBackupDestinations();
    expect(connectionsList).toHaveBeenCalledWith({ provider: 'git.custom', scope: 'user' });
    expect(result).toEqual([
      {
        id: 'conn-1',
        label: 'My backup repo',
        repoUrl: 'https://git.example.com/me/backups.git',
        branch: 'backups',
        authType: 'https-token',
        ageRecipient:
          'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
        status: 'connected',
        lastError: null,
        lastCheckedAt: null,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('falls back to sensible defaults when metadata is missing or malformed', async () => {
    connectionsList.mockResolvedValue([connectionRef({ metadata: null })]);
    const [result] = await listBackupDestinations();
    expect(result.repoUrl).toBe('');
    expect(result.branch).toBe('');
    expect(result.authType).toBe('https-token');
    expect(result.ageRecipient).toBe('');
  });
});

describe('createBackupDestination', () => {
  it('stores the credential via sdk.secrets, then creates the connection with only the secretRef and plain-metadata recipient', async () => {
    secretsCreate.mockResolvedValue({ id: 'secret-1' });
    connectionsCreate.mockResolvedValue(connectionRef());

    await createBackupDestination({
      label: 'My backup repo',
      repoUrl: 'https://git.example.com/me/backups.git',
      branch: 'backups',
      authType: 'https-token',
      credential: 'ghp_supersecrettoken',
      ageRecipient: 'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
    });

    expect(secretsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'user', value: 'ghp_supersecrettoken' }),
    );
    const createArgs = connectionsCreate.mock.calls[0][0];
    expect(createArgs).toEqual({
      scope: 'user',
      provider: 'git.custom',
      label: 'My backup repo',
      secretRef: 'secret-1',
      metadata: {
        repoUrl: 'https://git.example.com/me/backups.git',
        branch: 'backups',
        authType: 'https-token',
        ageRecipient:
          'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
      },
    });
    expect(JSON.stringify(createArgs)).not.toContain('ghp_supersecrettoken');
  });

  it('supports an SSH private key as the credential', async () => {
    secretsCreate.mockResolvedValue({ id: 'secret-2' });
    connectionsCreate.mockResolvedValue(connectionRef({ metadata: { authType: 'ssh-key' } }));

    await createBackupDestination({
      label: 'SSH repo',
      repoUrl: 'git@git.example.com:me/backups.git',
      branch: 'backups',
      authType: 'ssh-key',
      credential: '-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----',
      ageRecipient: 'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
    });

    expect(connectionsCreate.mock.calls[0][0].metadata.authType).toBe('ssh-key');
  });
});

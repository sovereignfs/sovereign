import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireSession = vi.fn();
const createBackupDestination = vi.fn();

vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: { requireSession: () => requireSession() },
  },
}));
vi.mock('../../_lib/backup-destinations', () => ({
  createBackupDestination: (...args: unknown[]) => createBackupDestination(...args),
}));

const { connectBackupDestinationAction } = await import('../actions');

const VALID_RECIPIENT =
  'age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

function validEntries(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    label: 'My backup repo',
    repoUrl: 'https://git.example.com/me/backups.git',
    branch: 'backups',
    authType: 'https-token',
    credential: 'ghp_supersecrettoken',
    ageRecipient: VALID_RECIPIENT,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: 'user-1' } });
});

describe('connectBackupDestinationAction', () => {
  it('requires a session before doing anything else', async () => {
    requireSession.mockRejectedValue(new Error('unauthenticated'));
    await expect(connectBackupDestinationAction(null, formData(validEntries()))).rejects.toThrow(
      'unauthenticated',
    );
    expect(createBackupDestination).not.toHaveBeenCalled();
  });

  it('rejects an empty name without calling createBackupDestination', async () => {
    const result = await connectBackupDestinationAction(
      null,
      formData(validEntries({ label: '  ' })),
    );
    expect(result).toEqual({ ok: false, error: 'Give this destination a name.' });
    expect(createBackupDestination).not.toHaveBeenCalled();
  });

  it('rejects an empty repository URL', async () => {
    const result = await connectBackupDestinationAction(
      null,
      formData(validEntries({ repoUrl: '' })),
    );
    expect(result).toEqual({ ok: false, error: 'Enter the git repository URL.' });
    expect(createBackupDestination).not.toHaveBeenCalled();
  });

  it('rejects a repository URL that is not https/git/ssh', async () => {
    const result = await connectBackupDestinationAction(
      null,
      formData(validEntries({ repoUrl: 'ftp://not-a-git-host/repo' })),
    );
    expect(result).toEqual({
      ok: false,
      error: 'Enter a valid repository URL (https://… or git@…).',
    });
    expect(createBackupDestination).not.toHaveBeenCalled();
  });

  it('accepts an SSH-style repository URL (git@…)', async () => {
    createBackupDestination.mockResolvedValue({ id: 'conn-1' });
    const result = await connectBackupDestinationAction(
      null,
      formData(validEntries({ repoUrl: 'git@git.example.com:me/backups.git' })),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects an empty branch', async () => {
    const result = await connectBackupDestinationAction(
      null,
      formData(validEntries({ branch: '' })),
    );
    expect(result).toEqual({ ok: false, error: 'Enter a branch name.' });
    expect(createBackupDestination).not.toHaveBeenCalled();
  });

  it('rejects an invalid access method', async () => {
    const result = await connectBackupDestinationAction(
      null,
      formData(validEntries({ authType: 'carrier-pigeon' })),
    );
    expect(result).toEqual({ ok: false, error: 'Choose an access method.' });
    expect(createBackupDestination).not.toHaveBeenCalled();
  });

  it('rejects an empty credential with an access-token-specific message', async () => {
    const result = await connectBackupDestinationAction(
      null,
      formData(validEntries({ credential: '' })),
    );
    expect(result).toEqual({ ok: false, error: 'Paste an access token for this repository.' });
    expect(createBackupDestination).not.toHaveBeenCalled();
  });

  it('rejects an empty credential with an SSH-specific message when authType is ssh-key', async () => {
    const result = await connectBackupDestinationAction(
      null,
      formData(validEntries({ authType: 'ssh-key', credential: '' })),
    );
    expect(result).toEqual({
      ok: false,
      error: 'Paste the SSH private key for this repository.',
    });
    expect(createBackupDestination).not.toHaveBeenCalled();
  });

  it('rejects a missing or malformed backup key recipient without calling createBackupDestination', async () => {
    const result = await connectBackupDestinationAction(
      null,
      formData(validEntries({ ageRecipient: '' })),
    );
    expect(result).toEqual({
      ok: false,
      error: 'Generate a backup key above before connecting a destination.',
    });
    expect(createBackupDestination).not.toHaveBeenCalled();
  });

  it('creates the destination and returns ok on valid input', async () => {
    createBackupDestination.mockResolvedValue({ id: 'conn-1' });
    const result = await connectBackupDestinationAction(null, formData(validEntries()));
    expect(createBackupDestination).toHaveBeenCalledWith({
      label: 'My backup repo',
      repoUrl: 'https://git.example.com/me/backups.git',
      branch: 'backups',
      authType: 'https-token',
      credential: 'ghp_supersecrettoken',
      ageRecipient: VALID_RECIPIENT,
    });
    expect(result).toEqual({ ok: true, message: 'Backup destination connected.' });
  });

  it('returns a clean error, not a throw, when createBackupDestination fails', async () => {
    createBackupDestination.mockRejectedValue(new Error('db down'));
    const result = await connectBackupDestinationAction(null, formData(validEntries()));
    expect(result).toEqual({
      ok: false,
      error: 'Could not connect that destination. Check the details and try again.',
    });
  });
});

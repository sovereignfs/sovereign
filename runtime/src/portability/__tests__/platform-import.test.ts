import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock @sovereignfs/db before importing the module under test so the real DB
// is never opened during unit tests (same pattern as platform-e2ee.test.ts).
vi.mock('@sovereignfs/db', () => ({
  DEFAULT_TENANT_ID: 'default',
  createE2eeDeviceEnrollment: vi.fn(),
  createE2eeProfile: vi.fn(),
  getAccountPrefs: vi.fn(),
  getE2eeProfile: vi.fn(),
  getE2eeRecoveryWrapper: vi.fn(),
  listE2eeDeviceEnrollments: vi.fn(),
  listUserPluginSecretRefs: vi.fn(),
  setAccountPrefs: vi.fn(),
  upsertE2eeRecoveryWrapper: vi.fn(),
}));

vi.mock('@/src/db', () => ({ getPlatformDb: vi.fn() }));
vi.mock('@/src/account', () => ({ isValidTheme: vi.fn(), isValidTimezone: vi.fn() }));
vi.mock('@/src/avatars', () => ({ avatarsDir: vi.fn(), findAvatarFile: vi.fn() }));
vi.mock('@/src/plugin-status', () => ({ getDisabledPluginIds: vi.fn() }));
vi.mock('@/src/registry', () => ({ getInstalledPlugins: vi.fn() }));
vi.mock('@/src/secrets', () => ({ toSecretRef: vi.fn() }));
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  rmSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createE2eeProfile, getE2eeProfile, setAccountPrefs } from '@sovereignfs/db';
import { isValidTheme, isValidTimezone } from '@/src/account';
import { avatarsDir } from '@/src/avatars';
import { getPlatformDb } from '@/src/db';
import { applyPlatformImport } from '../platform';
import type { PlatformAccountSection } from '../restore';

const mockPdb = { dialect: 'sqlite' };
const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  vi.clearAllMocks();
});

function account(overrides: Partial<PlatformAccountSection> = {}): PlatformAccountSection {
  return {
    profile: { name: null, email: null, image: null },
    preferences: { timezone: 'UTC', theme: 'light' },
    ...overrides,
  };
}

describe('applyPlatformImport — profile name', () => {
  it('overwrites the current name when the bundle has a non-empty one', async () => {
    vi.mocked(getPlatformDb).mockResolvedValue(mockPdb as never);
    vi.mocked(isValidTimezone).mockReturnValue(false);
    vi.mocked(isValidTheme).mockReturnValue(false);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    await applyPlatformImport(
      'u1',
      'cookie',
      account({ profile: { name: '  Imported Name  ', email: null, image: null } }),
      null,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/update-user'),
      expect.objectContaining({ body: JSON.stringify({ name: 'Imported Name' }) }),
    );
  });

  it('does not touch the name when the bundle has none', async () => {
    vi.mocked(getPlatformDb).mockResolvedValue(mockPdb as never);
    vi.mocked(isValidTimezone).mockReturnValue(false);
    vi.mocked(isValidTheme).mockReturnValue(false);

    await applyPlatformImport(
      'u1',
      'cookie',
      account({ profile: { name: null, email: null, image: null } }),
      null,
    );
    await applyPlatformImport(
      'u1',
      'cookie',
      account({ profile: { name: '   ', email: null, image: null } }),
      null,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('applyPlatformImport — preferences', () => {
  it('overwrites timezone/theme when both are valid', async () => {
    vi.mocked(getPlatformDb).mockResolvedValue(mockPdb as never);
    vi.mocked(isValidTimezone).mockReturnValue(true);
    vi.mocked(isValidTheme).mockReturnValue(true);

    await applyPlatformImport(
      'u1',
      'cookie',
      account({ preferences: { timezone: 'America/New_York', theme: 'dark' } }),
      null,
    );

    expect(setAccountPrefs).toHaveBeenCalledWith(mockPdb, 'u1', {
      timezone: 'America/New_York',
      theme: 'dark',
    });
  });

  it('skips setAccountPrefs entirely when neither value validates', async () => {
    vi.mocked(getPlatformDb).mockResolvedValue(mockPdb as never);
    vi.mocked(isValidTimezone).mockReturnValue(false);
    vi.mocked(isValidTheme).mockReturnValue(false);

    await applyPlatformImport('u1', 'cookie', account(), null);

    expect(setAccountPrefs).not.toHaveBeenCalled();
  });

  it('patches only the valid field when the other fails validation', async () => {
    vi.mocked(getPlatformDb).mockResolvedValue(mockPdb as never);
    vi.mocked(isValidTimezone).mockReturnValue(true);
    vi.mocked(isValidTheme).mockReturnValue(false);

    await applyPlatformImport(
      'u1',
      'cookie',
      account({ preferences: { timezone: 'America/New_York', theme: 'not-a-real-theme' } }),
      null,
    );

    expect(setAccountPrefs).toHaveBeenCalledWith(mockPdb, 'u1', { timezone: 'America/New_York' });
  });
});

describe('applyPlatformImport — avatar', () => {
  it('deletes any existing avatar files for the user and writes the imported one', async () => {
    vi.mocked(getPlatformDb).mockResolvedValue(mockPdb as never);
    vi.mocked(isValidTimezone).mockReturnValue(false);
    vi.mocked(isValidTheme).mockReturnValue(false);
    vi.mocked(avatarsDir).mockReturnValue('/data/avatars');
    vi.mocked(readdirSync).mockReturnValue(['u1.png', 'u1.old.jpg', 'other-user.png'] as never);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    await applyPlatformImport('u1', 'cookie', account(), {
      ext: 'png',
      bytes: new Uint8Array([1, 2, 3]),
    });

    // Only this user's existing avatar files are removed, not other users'.
    expect(rmSync).toHaveBeenCalledWith('/data/avatars/u1.png', { force: true });
    expect(rmSync).toHaveBeenCalledWith('/data/avatars/u1.old.jpg', { force: true });
    expect(rmSync).not.toHaveBeenCalledWith('/data/avatars/other-user.png', { force: true });
    expect(mkdirSync).toHaveBeenCalledWith('/data/avatars', { recursive: true });
    expect(writeFileSync).toHaveBeenCalledWith(
      '/data/avatars/u1.png',
      Buffer.from(new Uint8Array([1, 2, 3])),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/update-user'),
      expect.objectContaining({
        body: expect.stringContaining('/api/account/avatar/u1?v='),
      }),
    );
  });

  it('rejects a disallowed extension without writing or replacing anything', async () => {
    vi.mocked(getPlatformDb).mockResolvedValue(mockPdb as never);
    vi.mocked(isValidTimezone).mockReturnValue(false);
    vi.mocked(isValidTheme).mockReturnValue(false);
    vi.mocked(avatarsDir).mockReturnValue('/data/avatars');

    await applyPlatformImport('u1', 'cookie', account(), {
      ext: 'svg',
      bytes: new Uint8Array([1, 2, 3]),
    });

    expect(rmSync).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when the bundle has no avatar', async () => {
    vi.mocked(getPlatformDb).mockResolvedValue(mockPdb as never);
    vi.mocked(isValidTimezone).mockReturnValue(false);
    vi.mocked(isValidTheme).mockReturnValue(false);

    await applyPlatformImport('u1', 'cookie', account(), null);

    expect(rmSync).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
  });
});

describe('applyPlatformImport — e2ee delegation', () => {
  it('applies bundled e2ee material when the account section carries it', async () => {
    vi.mocked(getPlatformDb).mockResolvedValue(mockPdb as never);
    vi.mocked(isValidTimezone).mockReturnValue(false);
    vi.mocked(isValidTheme).mockReturnValue(false);
    vi.mocked(getE2eeProfile).mockResolvedValue(undefined);
    vi.mocked(createE2eeProfile).mockResolvedValue({
      id: 'new',
      tenantId: 'default',
      userId: 'u1',
      status: 'active',
      cmkAlgorithm: 'AES-GCM-256',
      createdAt: 0,
      updatedAt: 0,
    });

    await applyPlatformImport(
      'u1',
      'cookie',
      account({
        e2ee: {
          profile: { status: 'active', cmkAlgorithm: 'AES-GCM-256' },
          recoveryWrapper: null,
          deviceEnrollments: [],
        },
      }),
      null,
    );

    expect(createE2eeProfile).toHaveBeenCalledWith(
      mockPdb,
      expect.objectContaining({ userId: 'u1', cmkAlgorithm: 'AES-GCM-256' }),
    );
  });
});

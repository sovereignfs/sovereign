import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock @sovereignfs/db before importing the module under test so the real DB
// is never opened during unit tests (same pattern as activity.test.ts).
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
// platform.ts's other `@/` imports aren't exercised by the functions under
// test here, but the module graph must still resolve — stub them out (same
// pattern as middleware-regression.test.ts).
vi.mock('@/src/account', () => ({ isValidTheme: vi.fn(), isValidTimezone: vi.fn() }));
vi.mock('@/src/avatars', () => ({ avatarsDir: vi.fn(), findAvatarFile: vi.fn() }));
vi.mock('@/src/plugin-status', () => ({ getDisabledPluginIds: vi.fn() }));
vi.mock('@/src/registry', () => ({ getInstalledPlugins: vi.fn() }));
vi.mock('@/src/secrets', () => ({ toSecretRef: vi.fn() }));

import {
  createE2eeDeviceEnrollment,
  createE2eeProfile,
  getE2eeProfile,
  getE2eeRecoveryWrapper,
  listE2eeDeviceEnrollments,
  upsertE2eeRecoveryWrapper,
} from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';
import type { PlatformE2eeExportData } from '../assemble';
import { applyE2eeImport, gatherE2eeExport } from '../platform';

const mockPdb = { dialect: 'sqlite' };

afterEach(() => {
  vi.clearAllMocks();
});

describe('gatherE2eeExport', () => {
  it('returns null when the user has no encryption profile', async () => {
    vi.mocked(getE2eeProfile).mockResolvedValue(undefined);

    const result = await gatherE2eeExport(mockPdb as never, 'u1');

    expect(result).toBeNull();
  });

  it('gathers profile, recovery wrapper, and active device enrollments', async () => {
    vi.mocked(getE2eeProfile).mockResolvedValue({
      id: 'p1',
      tenantId: 'default',
      userId: 'u1',
      status: 'active',
      cmkAlgorithm: 'AES-GCM-256',
      createdAt: 0,
      updatedAt: 0,
    });
    vi.mocked(getE2eeRecoveryWrapper).mockResolvedValue({
      id: 'r1',
      tenantId: 'default',
      userId: 'u1',
      wrappedCmk: 'wrapped-cmk',
      kdfAlgorithm: 'PBKDF2-SHA256',
      kdfParams: '{"iterations":600000}',
      kdfSalt: 'salt',
      algorithmVersion: 'v1',
      createdAt: 0,
      updatedAt: 0,
    });
    vi.mocked(listE2eeDeviceEnrollments).mockResolvedValue([
      {
        id: 'd1',
        tenantId: 'default',
        userId: 'u1',
        deviceId: 'device-1',
        deviceLabel: 'Chrome on macOS',
        wrappedCmk: 'wrapped-cmk-device',
        algorithmVersion: 'v1',
        createdAt: 0,
        lastUsedAt: null,
        revokedAt: null,
      },
    ]);

    const result = await gatherE2eeExport(mockPdb as never, 'u1');

    expect(result).toEqual({
      profile: { status: 'active', cmkAlgorithm: 'AES-GCM-256' },
      recoveryWrapper: {
        wrappedCmk: 'wrapped-cmk',
        kdfAlgorithm: 'PBKDF2-SHA256',
        kdfParams: '{"iterations":600000}',
        kdfSalt: 'salt',
        algorithmVersion: 'v1',
      },
      deviceEnrollments: [
        {
          deviceId: 'device-1',
          deviceLabel: 'Chrome on macOS',
          wrappedCmk: 'wrapped-cmk-device',
          algorithmVersion: 'v1',
        },
      ],
    });
  });

  it('returns a null recoveryWrapper when the user never set one up', async () => {
    vi.mocked(getE2eeProfile).mockResolvedValue({
      id: 'p1',
      tenantId: 'default',
      userId: 'u1',
      status: 'active',
      cmkAlgorithm: 'AES-GCM-256',
      createdAt: 0,
      updatedAt: 0,
    });
    vi.mocked(getE2eeRecoveryWrapper).mockResolvedValue(undefined);
    vi.mocked(listE2eeDeviceEnrollments).mockResolvedValue([]);

    const result = await gatherE2eeExport(mockPdb as never, 'u1');

    expect(result?.recoveryWrapper).toBeNull();
    expect(result?.deviceEnrollments).toEqual([]);
  });
});

const SAMPLE_E2EE: PlatformE2eeExportData = {
  profile: { status: 'active', cmkAlgorithm: 'AES-GCM-256' },
  recoveryWrapper: {
    wrappedCmk: 'wrapped-cmk',
    kdfAlgorithm: 'PBKDF2-SHA256',
    kdfParams: '{"iterations":600000}',
    kdfSalt: 'salt',
    algorithmVersion: 'v1',
  },
  deviceEnrollments: [
    {
      deviceId: 'device-1',
      deviceLabel: 'Chrome',
      wrappedCmk: 'wrapped-cmk-device',
      algorithmVersion: 'v1',
    },
  ],
};

describe('applyE2eeImport', () => {
  it('skips entirely when the importing user already has an encryption profile', async () => {
    vi.mocked(getPlatformDb).mockResolvedValue(mockPdb as never);
    vi.mocked(getE2eeProfile).mockResolvedValue({
      id: 'existing',
      tenantId: 'default',
      userId: 'u2',
      status: 'active',
      cmkAlgorithm: 'AES-GCM-256',
      createdAt: 0,
      updatedAt: 0,
    });

    await applyE2eeImport('u2', SAMPLE_E2EE);

    expect(createE2eeProfile).not.toHaveBeenCalled();
    expect(upsertE2eeRecoveryWrapper).not.toHaveBeenCalled();
    expect(createE2eeDeviceEnrollment).not.toHaveBeenCalled();
  });

  it('recreates the profile, recovery wrapper, and device enrollments when the user has none', async () => {
    vi.mocked(getPlatformDb).mockResolvedValue(mockPdb as never);
    vi.mocked(getE2eeProfile).mockResolvedValue(undefined);
    vi.mocked(createE2eeProfile).mockResolvedValue({
      id: 'new',
      tenantId: 'default',
      userId: 'u2',
      status: 'active',
      cmkAlgorithm: 'AES-GCM-256',
      createdAt: 0,
      updatedAt: 0,
    });

    await applyE2eeImport('u2', SAMPLE_E2EE);

    expect(createE2eeProfile).toHaveBeenCalledWith(
      mockPdb,
      expect.objectContaining({ userId: 'u2', tenantId: 'default', cmkAlgorithm: 'AES-GCM-256' }),
    );
    expect(upsertE2eeRecoveryWrapper).toHaveBeenCalledWith(
      mockPdb,
      expect.objectContaining({
        userId: 'u2',
        wrappedCmk: 'wrapped-cmk',
        kdfAlgorithm: 'PBKDF2-SHA256',
        kdfSalt: 'salt',
      }),
    );
    expect(createE2eeDeviceEnrollment).toHaveBeenCalledWith(
      mockPdb,
      expect.objectContaining({
        userId: 'u2',
        deviceId: 'device-1',
        deviceLabel: 'Chrome',
        wrappedCmk: 'wrapped-cmk-device',
      }),
    );
    // Row ids are regenerated, not copied from the bundle.
    const profileCallArgs = vi.mocked(createE2eeProfile).mock.calls[0]?.[1];
    expect(profileCallArgs?.id).not.toBe('p1');
  });

  it('skips the recovery wrapper when the bundle has none', async () => {
    vi.mocked(getPlatformDb).mockResolvedValue(mockPdb as never);
    vi.mocked(getE2eeProfile).mockResolvedValue(undefined);
    vi.mocked(createE2eeProfile).mockResolvedValue({
      id: 'new',
      tenantId: 'default',
      userId: 'u2',
      status: 'active',
      cmkAlgorithm: 'AES-GCM-256',
      createdAt: 0,
      updatedAt: 0,
    });

    await applyE2eeImport('u2', { ...SAMPLE_E2EE, recoveryWrapper: null, deviceEnrollments: [] });

    expect(upsertE2eeRecoveryWrapper).not.toHaveBeenCalled();
    expect(createE2eeDeviceEnrollment).not.toHaveBeenCalled();
  });
});

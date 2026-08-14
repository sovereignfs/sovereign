// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DeviceStorageKeySection } from '../DeviceStorageKeySection';

// jsdom doesn't implement <dialog>'s showModal()/close() — ConfirmDialog is
// always mounted (visibility is a prop, not conditional rendering) and calls
// close() in an effect on every render, so this must exist before anything
// in this file renders the section.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
}

const getDeviceStorageKeyStatus = vi.fn();
const loadReLockPolicy = vi.fn();
const exportDeviceOnlyData = vi.fn();
const importDeviceOnlyData = vi.fn();
const lockDeviceStorageKey = vi.fn();
const supports = vi.fn();
const secureStorageSet = vi.fn();
const secureStorageGet = vi.fn();

vi.mock('@sovereignfs/sdk/device-only-storage', async () => {
  const actual = await vi.importActual<typeof import('@sovereignfs/sdk/device-only-storage')>(
    '@sovereignfs/sdk/device-only-storage',
  );
  return {
    ...actual,
    getDeviceStorageKeyStatus: (...args: unknown[]) => getDeviceStorageKeyStatus(...args),
    loadReLockPolicy: (...args: unknown[]) => loadReLockPolicy(...args),
  };
});

vi.mock('@sovereignfs/sdk/device-only-export', () => ({
  exportDeviceOnlyData: (...args: unknown[]) => exportDeviceOnlyData(...args),
  importDeviceOnlyData: (...args: unknown[]) => importDeviceOnlyData(...args),
}));

vi.mock('@sovereignfs/sdk/device-only-session', () => ({
  lockDeviceStorageKey: (...args: unknown[]) => lockDeviceStorageKey(...args),
}));

// `supports('secureStorage')` defaults to `false` (no bridge registered) —
// every existing "web" test in this file relies on that default to reach
// `WebDeviceStorageKeySection` without mocking this module at all. Only the
// "native" describe block below overrides it to `true`.
vi.mock('@sovereignfs/sdk/device-client', () => ({
  supports: (...args: unknown[]) => supports(...args),
  secureStorage: {
    set: (...args: unknown[]) => secureStorageSet(...args),
    get: (...args: unknown[]) => secureStorageGet(...args),
  },
}));

/**
 * `DeviceStorageKeySection`'s unlocked ("set-up") view is the entry point for
 * the "Export data"/"Import data" controls this suite covers — driving the
 * component to that state through its real status check, same as a browser
 * would, rather than testing the internal `ExportFlow`/`ImportFlow`
 * components in isolation (neither is exported from the module).
 */
async function renderUnlocked() {
  getDeviceStorageKeyStatus.mockResolvedValue('set-up');
  loadReLockPolicy.mockResolvedValue('5m');
  const result = render(<DeviceStorageKeySection />);
  await screen.findByText('Device Storage Key');
  return result;
}

/**
 * `FormField`'s required-field marker (`*`) is a sibling text node inside
 * the `<label>`, so its `textContent` — what Testing Library's
 * `getByLabelText` matches against — is "Passphrase*", not "Passphrase".
 * An anchored-prefix regex matches that suffix while still distinguishing
 * "Passphrase" from "Confirm passphrase" (case-sensitive, so the lowercase
 * "passphrase" in "Confirm passphrase" never matches the `^Passphrase`
 * pattern).
 */
function fillPassphrase(label: string, value: string) {
  const pattern = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  fireEvent.change(screen.getByLabelText(pattern), { target: { value } });
}

beforeEach(() => {
  getDeviceStorageKeyStatus.mockReset();
  loadReLockPolicy.mockReset();
  exportDeviceOnlyData.mockReset();
  importDeviceOnlyData.mockReset();
  lockDeviceStorageKey.mockReset();
  secureStorageSet.mockReset();
  secureStorageGet.mockReset();
  // No bridge registered, matching a plain browser — every existing "web"
  // test below relies on this default to reach `WebDeviceStorageKeySection`
  // without setting it itself.
  supports.mockReset().mockReturnValue(false);
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DeviceStorageKeySection — export', () => {
  it('rejects mismatched passphrases without calling exportDeviceOnlyData', async () => {
    await renderUnlocked();
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));

    fillPassphrase('Passphrase', 'first-passphrase');
    fillPassphrase('Confirm passphrase', 'a-different-one');
    fireEvent.click(screen.getByRole('button', { name: 'Download export' }));

    expect(await screen.findByText('Passphrases don’t match.')).toBeDefined();
    expect(exportDeviceOnlyData).not.toHaveBeenCalled();
  });

  it('rejects a passphrase shorter than 8 characters without calling exportDeviceOnlyData', async () => {
    await renderUnlocked();
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));

    fillPassphrase('Passphrase', 'short');
    fillPassphrase('Confirm passphrase', 'short');
    fireEvent.click(screen.getByRole('button', { name: 'Download export' }));

    expect(await screen.findByText('Use a passphrase of at least 8 characters.')).toBeDefined();
    expect(exportDeviceOnlyData).not.toHaveBeenCalled();
  });

  it('exports, triggers a download, and returns to the idle view on success', async () => {
    exportDeviceOnlyData.mockResolvedValue({
      status: 'ok',
      file: {
        formatVersion: 'v1',
        kdfAlgorithm: 'PBKDF2-SHA256',
        kdfParams: '{}',
        kdfSalt: 'salt',
        wrappedData: 'ciphertext',
      },
    });
    await renderUnlocked();
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));

    fillPassphrase('Passphrase', 'a-valid-passphrase');
    fillPassphrase('Confirm passphrase', 'a-valid-passphrase');
    fireEvent.click(screen.getByRole('button', { name: 'Download export' }));

    await screen.findByRole('button', { name: 'Export data' });
    expect(exportDeviceOnlyData).toHaveBeenCalledWith('a-valid-passphrase');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('shows a status-derived error when the unlock ceremony is cancelled', async () => {
    exportDeviceOnlyData.mockResolvedValue({ status: 'cancelled' });
    await renderUnlocked();
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));

    fillPassphrase('Passphrase', 'a-valid-passphrase');
    fillPassphrase('Confirm passphrase', 'a-valid-passphrase');
    fireEvent.click(screen.getByRole('button', { name: 'Download export' }));

    expect(await screen.findByText('Cancelled.')).toBeDefined();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('shows a generic error, without crashing, when exportDeviceOnlyData throws', async () => {
    exportDeviceOnlyData.mockRejectedValue(new Error('OPFS write failed'));
    await renderUnlocked();
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));

    fillPassphrase('Passphrase', 'a-valid-passphrase');
    fillPassphrase('Confirm passphrase', 'a-valid-passphrase');
    fireEvent.click(screen.getByRole('button', { name: 'Download export' }));

    expect(
      await screen.findByText('Something went wrong exporting your data. Please try again.'),
    ).toBeDefined();
  });
});

describe('DeviceStorageKeySection — import', () => {
  function selectFile(container: HTMLElement, contents: string, name = 'export.json') {
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error('file input not found');
    const file = new File([contents], name, { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });
  }

  it('shows a parse error for a file that is not valid JSON, without calling importDeviceOnlyData', async () => {
    const { container } = await renderUnlocked();
    fireEvent.click(screen.getByRole('button', { name: 'Import data' }));

    selectFile(container, 'not json at all');
    fillPassphrase('Passphrase', 'a-passphrase');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(
      await screen.findByText('That file doesn’t look like a Sovereign export.'),
    ).toBeDefined();
    expect(importDeviceOnlyData).not.toHaveBeenCalled();
  });

  it('shows an incorrect-passphrase error from importDeviceOnlyData', async () => {
    importDeviceOnlyData.mockResolvedValue({ status: 'invalid-passphrase' });
    const { container } = await renderUnlocked();
    fireEvent.click(screen.getByRole('button', { name: 'Import data' }));

    selectFile(container, '{"formatVersion":"v1"}');
    fillPassphrase('Passphrase', 'wrong-passphrase');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(await screen.findByText('Incorrect passphrase.')).toBeDefined();
  });

  it('shows a success summary and returns to idle after a successful import', async () => {
    importDeviceOnlyData.mockResolvedValue({ status: 'ok', pluginCount: 2, entryCount: 5 });
    const { container } = await renderUnlocked();
    fireEvent.click(screen.getByRole('button', { name: 'Import data' }));

    selectFile(container, '{"formatVersion":"v1"}');
    fillPassphrase('Passphrase', 'a-passphrase');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(await screen.findByText('Restored 5 items across 2 apps.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Export data' })).toBeDefined();
  });

  it('shows a generic error, without crashing, when importDeviceOnlyData throws', async () => {
    importDeviceOnlyData.mockRejectedValue(new Error('OPFS write failed'));
    const { container } = await renderUnlocked();
    fireEvent.click(screen.getByRole('button', { name: 'Import data' }));

    selectFile(container, '{"formatVersion":"v1"}');
    fillPassphrase('Passphrase', 'a-passphrase');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(
      await screen.findByText('Something went wrong restoring your data. Please try again.'),
    ).toBeDefined();
  });
});

/**
 * Regression coverage for the bug this file's native describe block exists
 * to catch: `DeviceStorageKeySection` used to call `getDeviceStorageKeyStatus()`
 * (the web/PWA-only status function) unconditionally, so a native shell
 * (where that check always fails — no WebAuthn PRF/OPFS in a Capacitor
 * WebView) rendered the same "use the native app instead" message while
 * already running inside it. The fix branches on `supports('secureStorage')`
 * before ever reaching the web-only path.
 */
describe('DeviceStorageKeySection — transport dispatch', () => {
  it('renders the web flow and never calls secureStorage when no native bridge is present', async () => {
    getDeviceStorageKeyStatus.mockResolvedValue('not-set-up');
    render(<DeviceStorageKeySection />);

    expect(await screen.findByText('Set up Device Storage Key')).toBeDefined();
    expect(secureStorageSet).not.toHaveBeenCalled();
  });

  it('renders the native flow and never calls getDeviceStorageKeyStatus when a native bridge is present', async () => {
    supports.mockReturnValue(true);
    render(<DeviceStorageKeySection />);

    expect(await screen.findByText('Verify it works')).toBeDefined();
    expect(screen.queryByText(/Use the native app instead/)).toBeNull();
    expect(getDeviceStorageKeyStatus).not.toHaveBeenCalled();
  });
});

describe('DeviceStorageKeySection — native (Capacitor)', () => {
  beforeEach(() => {
    supports.mockReturnValue(true);
  });

  async function renderNative() {
    const result = render(<DeviceStorageKeySection />);
    await screen.findByRole('button', { name: 'Verify it works' });
    return result;
  }

  it('shows success after a matching set/get round-trip through the bridge', async () => {
    secureStorageSet.mockResolvedValue({ status: 'ok', value: undefined });
    secureStorageGet.mockImplementation(async (_pluginId: string, _key: string) => {
      const probeValue = secureStorageSet.mock.calls[0]?.[2] as number;
      return { status: 'ok', value: probeValue };
    });
    await renderNative();

    fireEvent.click(screen.getByRole('button', { name: 'Verify it works' }));

    expect(
      await screen.findByText(
        'Verified — your device’s passcode, fingerprint, or face unlock works for apps that keep data only on this device.',
      ),
    ).toBeDefined();
    expect(secureStorageSet).toHaveBeenCalledWith(
      'fs.sovereign.account',
      'device-storage-key-verify',
      expect.any(Number),
    );
    expect(secureStorageGet).toHaveBeenCalledWith(
      'fs.sovereign.account',
      'device-storage-key-verify',
    );
  });

  it('shows the no-device-auth message when the write reports unavailable', async () => {
    secureStorageSet.mockResolvedValue({ status: 'unavailable', capability: 'secureStorage' });
    await renderNative();

    fireEvent.click(screen.getByRole('button', { name: 'Verify it works' }));

    expect(
      await screen.findByText(/This device has no passcode, fingerprint, or face unlock set up/),
    ).toBeDefined();
    expect(secureStorageGet).not.toHaveBeenCalled();
  });

  it('shows "Cancelled." when the write is dismissed', async () => {
    secureStorageSet.mockResolvedValue({ status: 'dismissed' });
    await renderNative();

    fireEvent.click(screen.getByRole('button', { name: 'Verify it works' }));

    expect(await screen.findByText('Cancelled.')).toBeDefined();
  });

  it('shows the returned error message when the write fails', async () => {
    secureStorageSet.mockResolvedValue({
      status: 'failed',
      error: 'Keychain write failed (-25299)',
    });
    await renderNative();

    fireEvent.click(screen.getByRole('button', { name: 'Verify it works' }));

    expect(await screen.findByText('Keychain write failed (-25299)')).toBeDefined();
  });

  it('reports failure when the read-back value does not match what was written', async () => {
    secureStorageSet.mockResolvedValue({ status: 'ok', value: undefined });
    secureStorageGet.mockResolvedValue({ status: 'ok', value: 'a-different-value' });
    await renderNative();

    fireEvent.click(screen.getByRole('button', { name: 'Verify it works' }));

    expect(
      await screen.findByText('Wrote successfully but could not read the value back correctly.'),
    ).toBeDefined();
  });
});

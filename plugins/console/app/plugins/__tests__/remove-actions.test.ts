import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileSync = vi.fn();
const requireSession = vi.fn();
const hasCapability = vi.fn();

vi.mock('child_process', () => ({ execFileSync: (...args: unknown[]) => execFileSync(...args) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-sovereign-user-id': 'user-1' })),
}));
vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: {
      requireSession: () => requireSession(),
      hasCapability: (...args: unknown[]) => hasCapability(...args),
    },
  },
}));

const { removePluginAction } = await import('../remove-actions');

/** Stand in for GET /api/admin/plugins — the installed-plugin allowlist. */
function mockInstalled(ids: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(ids.map((id) => ({ id })))))),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: 'user-1' } });
  hasCapability.mockReturnValue(true);
  mockInstalled(['tasks']);
});

describe('removePluginAction authorization', () => {
  it('refuses a session without plugin:manage, without spawning anything', async () => {
    hasCapability.mockReturnValue(false);

    const result = await removePluginAction('tasks');

    expect(result).toEqual({ ok: false, error: 'Insufficient privileges to remove apps.' });
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('checks plugin:manage specifically', async () => {
    await removePluginAction('tasks');

    expect(hasCapability).toHaveBeenCalledWith(expect.anything(), 'plugin:manage');
  });
});

describe('removePluginAction argument handling', () => {
  it('rejects an id that is not installed, without spawning anything', async () => {
    const result = await removePluginAction('not-installed');

    expect(result).toEqual({ ok: false, error: 'Unknown app.' });
    expect(execFileSync).not.toHaveBeenCalled();
  });

  // The original defect: `execSync('pnpm sv plugin remove ' + JSON.stringify(id))`
  // ran through a shell, and JSON.stringify does not neutralize `$(…)`,
  // backticks or `${…}` inside the double quotes it adds.
  it('does not spawn a shell for an id carrying shell metacharacters', async () => {
    const result = await removePluginAction('tasks$(id)');

    expect(result).toEqual({ ok: false, error: 'Unknown app.' });
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('passes the id as a separate argv entry, never interpolated into a command string', async () => {
    await removePluginAction('tasks');

    expect(execFileSync).toHaveBeenCalledWith(
      'pnpm',
      ['sv', 'plugin', 'remove', 'tasks'],
      expect.objectContaining({ timeout: 60_000 }),
    );
    // No `shell: true` — execFileSync must exec directly.
    expect(execFileSync.mock.calls[0]?.[2]).not.toHaveProperty('shell');
  });
});

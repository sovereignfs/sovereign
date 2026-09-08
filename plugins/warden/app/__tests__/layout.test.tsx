import { beforeEach, describe, expect, it, vi } from 'vitest';

const registerPortability = vi.fn();
vi.mock('../_lib/portability', () => ({
  registerPortability: (...args: unknown[]) => registerPortability(...args),
}));

const { default: WardenLayout } = await import('../layout');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WardenLayout', () => {
  /**
   * Regression test for a real production defect: this layout is an
   * *ancestor* of app/loading.tsx's Suspense boundary (every route under
   * the plugin renders through it first), so an `await` here — however
   * fast `registerPortability()` itself resolves — blocks the first byte
   * of every single Warden navigation, silently defeating the streaming
   * fix regardless of how well the routes below it are optimized. The
   * layout must therefore return synchronously, not as a Promise a caller
   * would need to await.
   */
  it('returns children synchronously, not as a Promise to await', () => {
    registerPortability.mockResolvedValue(undefined);
    const children = 'the chat shell';
    const result = WardenLayout({ children });
    expect(result).toBe(children);
    expect(result).not.toBeInstanceOf(Promise);
  });

  it('still calls registerPortability, fire-and-forget', () => {
    registerPortability.mockResolvedValue(undefined);
    WardenLayout({ children: 'x' });
    expect(registerPortability).toHaveBeenCalledTimes(1);
  });

  it('a registerPortability rejection never surfaces — best-effort per its own contract', async () => {
    let rejectRegistration: (reason: unknown) => void = () => {};
    registerPortability.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRegistration = reject;
      }),
    );

    expect(() => WardenLayout({ children: 'x' })).not.toThrow();
    rejectRegistration(new Error('registry unavailable'));
    // Let the rejection's microtask settle; an unhandled-rejection listener
    // failing the test run would be how a regression here shows up.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

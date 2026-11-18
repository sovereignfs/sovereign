import { describe, expect, it, vi } from 'vitest';

vi.mock('@sovereignfs/ui', () => ({ isInstalledDisplay: () => false }));
const { APP_ADDRESS_WAIT_MS, openApp, openShortcut, plainClick } = await import('../../app/launch');

const click = (
  over: Partial<
    Record<'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'defaultPrevented', unknown>
  > = {},
) =>
  ({
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    ...over,
  }) as unknown as Parameters<typeof openApp>[0] & { preventDefault: ReturnType<typeof vi.fn> };

describe('opening an app from its tile', () => {
  it('follows the link in the same tab in a browser tab, as it always did', () => {
    const open = vi.fn();
    const event = click();
    openApp(event, 'https://notes.example.org/', { installed: () => false, open });
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('opens a new window in an installed core, which a device hands to the installed app', () => {
    const open = vi.fn();
    const event = click();
    openApp(event, 'https://notes.example.org/', { installed: () => true, open });
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith('https://notes.example.org/');
  });

  it.each([['metaKey'], ['ctrlKey'], ['shiftKey'], ['altKey']])(
    'leaves a click with %s to the browser, which opens what was asked for',
    (key) => {
      const open = vi.fn();
      const event = click({ [key]: true });
      openApp(event, 'https://notes.example.org/', { installed: () => true, open });
      expect(open).not.toHaveBeenCalled();
    },
  );

  it('is a plain click only with the main button, and not once something else has handled it', () => {
    expect(plainClick(click())).toBe(true);
    expect(plainClick(click({ button: 1 }))).toBe(false);
    expect(plainClick(click({ defaultPrevented: true }))).toBe(false);
  });
});

describe('opening a shortcut that names an app', () => {
  const shortcut = { url: 'https://open.spotify.com/', appUrl: 'spotify:playlist:1' };
  const deps = (over: { installed?: boolean; phone?: boolean; leaves?: boolean } = {}) => {
    const later: (() => void)[] = [];
    const d = {
      installed: () => over.installed ?? false,
      phone: () => over.phone ?? false,
      open: vi.fn(),
      go: vi.fn(),
      later: vi.fn((then: () => void, ms: number) => {
        expect(ms).toBe(APP_ADDRESS_WAIT_MS);
        later.push(then);
      }),
      watch: vi.fn((left: () => void) => {
        if (over.leaves) left();
        return vi.fn();
      }),
    };
    return { d, wait: () => later.forEach((then) => then()) };
  };

  it('opens the web address in a new tab, as it always did, in a browser on a computer', () => {
    const { d } = deps();
    const event = click();
    openShortcut(event, shortcut, d);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(d.go).not.toHaveBeenCalled();
  });

  it.each([
    ['an installed core', { installed: true }],
    ['a phone', { phone: true }],
  ])(
    'tries the app first from %s, and leaves it there when the app comes forward',
    (_where, where) => {
      const { d, wait } = deps({ ...where, leaves: true });
      const event = click();
      openShortcut(event, shortcut, d);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(d.go).toHaveBeenCalledWith('spotify:playlist:1');
      wait();
      expect(d.open).not.toHaveBeenCalled();
    },
  );

  it('opens the web address after all when no app answers', () => {
    const { d, wait } = deps({ phone: true });
    openShortcut(click(), shortcut, d);
    wait();
    expect(d.open).toHaveBeenCalledWith('https://open.spotify.com/');
  });

  it('does nothing of its own for a shortcut with no app address, or a click with a key held', () => {
    const { d } = deps({ phone: true });
    openShortcut(click(), { url: shortcut.url }, d);
    openShortcut(click({ metaKey: true }), shortcut, d);
    expect(d.go).not.toHaveBeenCalled();
  });
});

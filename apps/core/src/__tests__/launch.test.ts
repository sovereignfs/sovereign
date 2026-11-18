import { describe, expect, it, vi } from 'vitest';

vi.mock('@sovereignfs/ui', () => ({ isInstalledDisplay: () => false }));
const { openApp, plainClick } = await import('../../app/launch');

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

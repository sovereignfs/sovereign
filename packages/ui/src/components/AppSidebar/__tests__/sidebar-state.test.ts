import { describe, expect, it } from 'vitest';
import {
  parseSidebarStored,
  sidebarStateFor,
  sidebarStorageKey,
  toggleSidebarHidden,
  toggleSidebarRail,
  type SidebarStored,
} from '../sidebar-state';

// Ported from Shopper's src/ui/sidebar.test.ts, with the kinds of page left to the app.

describe('the default', () => {
  it('is full on every kind of page until a person chooses otherwise, or what the app says', () => {
    expect(sidebarStateFor('home', {})).toBe('full');
    expect(sidebarStateFor('page', {})).toBe('full');
    expect(sidebarStateFor('page', {}, 'rail')).toBe('rail');
  });

  it('is kept under a key per app', () => {
    expect(sidebarStorageKey('shopper')).toBe('sv.sidebar.shopper');
    expect(sidebarStorageKey('tusk')).not.toBe(sidebarStorageKey('shopper'));
  });
});

describe('what was stored', () => {
  it('is read back, and a kind that was not stored keeps its default', () => {
    const stored = parseSidebarStored(JSON.stringify({ page: { state: 'hidden', shown: 'full' } }));
    expect(sidebarStateFor('page', stored)).toBe('hidden');
    expect(sidebarStateFor('home', stored)).toBe('full');
  });

  it('is ignored when it is not what was written: nothing, nonsense, or a state that does not exist', () => {
    for (const raw of [
      null,
      undefined,
      '',
      'not json',
      '[]',
      '3',
      '{"page":"rail"}',
      '{"page":{"state":"wide"}}',
    ]) {
      expect(parseSidebarStored(raw), String(raw)).toEqual({});
    }
  });

  it('remembers how a hidden one was shown, or a rail when it does not say', () => {
    expect(parseSidebarStored('{"home":{"state":"hidden"}}').home).toEqual({
      state: 'hidden',
      shown: 'rail',
    });
    expect(parseSidebarStored('{"home":{"state":"full"}}').home).toEqual({
      state: 'full',
      shown: 'full',
    });
  });

  it('does not take a kind from the prototype', () => {
    expect(sidebarStateFor('toString', {})).toBe('full');
    expect(sidebarStateFor('__proto__', parseSidebarStored('{"__proto__":{"state":"rail"}}'))).toBe(
      'full',
    );
  });
});

describe('the buttons', () => {
  it('the header’s hides it and shows it again as it was, whichever it was', () => {
    for (const kind of ['home', 'page']) {
      const was = sidebarStateFor(kind, {});
      const hidden = toggleSidebarHidden(kind, {});
      expect(sidebarStateFor(kind, hidden)).toBe('hidden');
      expect(sidebarStateFor(kind, toggleSidebarHidden(kind, hidden))).toBe(was);
    }
    // A rail that was widened, then hidden, comes back wide.
    const wide = toggleSidebarRail('page', toggleSidebarRail('page', {}));
    expect(
      sidebarStateFor('page', toggleSidebarHidden('page', toggleSidebarHidden('page', wide))),
    ).toBe('full');
  });

  it('the sidebar’s own makes a full one a rail and a rail full, and does nothing to a hidden one', () => {
    expect(sidebarStateFor('home', toggleSidebarRail('home', {}))).toBe('rail');
    const hidden = toggleSidebarHidden('home', {});
    expect(toggleSidebarRail('home', hidden)).toBe(hidden);
  });

  it('change one kind of page and leave the other as it was', () => {
    const stored: SidebarStored = toggleSidebarHidden('page', {});
    expect(sidebarStateFor('home', stored)).toBe('full');
    expect(sidebarStateFor('page', toggleSidebarRail('home', stored))).toBe('hidden');
  });
});

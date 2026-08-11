import { describe, expect, it } from 'vitest';
import { decideFocusRoute, type FocusPluginInfo } from '../route-lock';

const tally: FocusPluginInfo = { id: 'fs.sovereign.tally', routePrefix: '/tally' };
const launcher: FocusPluginInfo = { id: 'fs.sovereign.launcher', routePrefix: '/launcher' };
const account: FocusPluginInfo = { id: 'fs.sovereign.account', routePrefix: '/account' };
const plugins = [tally, launcher, account];

describe('decideFocusRoute', () => {
  it('allows everything when there is no focus signal', () => {
    expect(decideFocusRoute('/launcher', null, plugins)).toEqual({ kind: 'allow' });
    expect(decideFocusRoute('/console', null, plugins)).toEqual({ kind: 'allow' });
  });

  it('allows the focused plugin itself, including nested paths', () => {
    expect(decideFocusRoute('/tally', 'fs.sovereign.tally', plugins)).toEqual({ kind: 'allow' });
    expect(decideFocusRoute('/tally/groups/abc', 'fs.sovereign.tally', plugins)).toEqual({
      kind: 'allow',
    });
  });

  it('redirects an out-of-focus path to the focused plugin root', () => {
    expect(decideFocusRoute('/launcher', 'fs.sovereign.tally', plugins)).toEqual({
      kind: 'redirect',
      routePrefix: '/tally',
    });
  });

  it('redirects "/" when the focused plugin is not the root', () => {
    expect(decideFocusRoute('/', 'fs.sovereign.tally', plugins)).toEqual({
      kind: 'redirect',
      routePrefix: '/tally',
    });
  });

  for (const path of ['/account', '/account/preferences', '/account/data']) {
    it(`allows ${path} regardless of focus (password change, session revocation, data:provide consent)`, () => {
      expect(decideFocusRoute(path, 'fs.sovereign.tally', plugins)).toEqual({ kind: 'allow' });
    });
  }

  it('allows /paywall/* regardless of focus', () => {
    expect(decideFocusRoute('/paywall/fs.sovereign.tally', 'fs.sovereign.tally', plugins)).toEqual({
      kind: 'allow',
    });
  });

  it('allows /api/* regardless of focus', () => {
    expect(decideFocusRoute('/api/account/prefs', 'fs.sovereign.tally', plugins)).toEqual({
      kind: 'allow',
    });
  });

  it('does not treat a partial-segment match as the focused plugin or an allowlisted prefix', () => {
    expect(decideFocusRoute('/tally2', 'fs.sovereign.tally', plugins)).toEqual({
      kind: 'redirect',
      routePrefix: '/tally',
    });
    expect(decideFocusRoute('/accountant', 'fs.sovereign.tally', plugins)).toEqual({
      kind: 'redirect',
      routePrefix: '/tally',
    });
  });

  it('fails open when the focused plugin ID matches no installed plugin', () => {
    // Misconfigured shell, or the focus target was uninstalled since — there
    // is no safe redirect target, so routing falls back to unlocked.
    expect(decideFocusRoute('/console', 'fs.sovereign.uninstalled', plugins)).toEqual({
      kind: 'allow',
    });
  });

  it('grants no access a forged focus target would not already have — it only ever redirects', () => {
    // The route lock never widens or narrows what a path resolves to beyond
    // "allow, unchanged" or "redirect to the focused root" — it has no third
    // outcome that could grant extra access.
    const decision = decideFocusRoute('/console', 'fs.sovereign.tally', plugins);
    expect(decision.kind).not.toBe('allow');
    expect(decision).toEqual({ kind: 'redirect', routePrefix: '/tally' });
  });
});

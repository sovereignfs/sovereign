import { describe, expect, it } from 'vitest';
import { resolveWaysIn, WaysInError } from '../server/ways-in';

describe('the ways in (auth.md §5)', () => {
  it('turns own accounts on with no core and off with one, and sign-up open only when core is the only way in', () => {
    expect(resolveWaysIn({})).toEqual({ local: true, core: undefined, signUp: 'closed' });
    expect(resolveWaysIn({ coreUrl: 'https://core.test' })).toEqual({
      local: false,
      core: 'https://core.test',
      signUp: 'open',
    });
    expect(resolveWaysIn({ coreUrl: 'https://core.test', local: 'true' })).toMatchObject({
      local: true,
      signUp: 'closed',
    });
    expect(resolveWaysIn({ signUp: 'open' }).signUp).toBe('open');
  });

  it('refuses an app with no way in, and a value the contract does not name', () => {
    expect(() => resolveWaysIn({ local: 'false' })).toThrow(WaysInError);
    expect(() => resolveWaysIn({ local: '1' })).toThrow(/true or false/);
    expect(() => resolveWaysIn({ signUp: 'sometimes' })).toThrow(/open, closed or invite/);
  });
});

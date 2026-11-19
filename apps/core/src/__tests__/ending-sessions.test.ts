import { describe, expect, it } from 'vitest';
import { EndingSessions, PLAN_KEPT_MS } from '../oauth/logout-notices';

const plan = (sid: string) => [{ clientId: 'app', sub: 'u1', sid }];

describe('the plans held while sessions are deleted', () => {
  it('gives a plan back once, to the deletion that read it', () => {
    const held = new EndingSessions(() => 0);
    held.hold('s1', plan('s1'));
    expect(held.take('s1')).toEqual(plan('s1'));
    expect(held.take('s1')).toBeUndefined();
    expect(held.size).toBe(0);
  });

  it('holds nothing for a session no app is to be told about', () => {
    const held = new EndingSessions(() => 0);
    held.hold('s1', []);
    expect(held.size).toBe(0);
  });

  it('drops a plan whose deletion never finished, once it is older than a minute', () => {
    let now = 0;
    const held = new EndingSessions(() => now);
    held.hold('failed', plan('failed'));
    now = PLAN_KEPT_MS + 1;
    held.hold('next', plan('next'));
    expect(held.size).toBe(1);
    expect(held.take('failed')).toBeUndefined();
    expect(held.take('next')).toEqual(plan('next'));
  });

  it('keeps a plan that is still within the minute', () => {
    let now = 0;
    const held = new EndingSessions(() => now);
    held.hold('slow', plan('slow'));
    now = PLAN_KEPT_MS - 1;
    held.hold('other', plan('other'));
    expect(held.take('slow')).toEqual(plan('slow'));
  });
});

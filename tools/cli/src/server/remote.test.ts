import { describe, expect, it } from 'vitest';
import type { Suite } from '../suite/types.js';
import { targetOf } from './remote.js';

const suite = (server: Record<string, unknown>) => ({ server }) as unknown as Suite;

describe('where sv connects', () => {
  it('is root unless suite.yml names another user, as spec/suite.md says', () => {
    expect(targetOf(suite({ host: '203.0.113.7' })).user).toBe('root');
    expect(targetOf(suite({ host: '203.0.113.7', user: 'ops', port: 2222 }))).toEqual({
      host: '203.0.113.7',
      port: 2222,
      user: 'ops',
    });
  });
});

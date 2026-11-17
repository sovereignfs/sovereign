import { describe, expect, it } from 'vitest';
import { trimTrailingSlashes } from '../slashes';

describe('trimTrailingSlashes', () => {
  it('drops every trailing slash and nothing else', () => {
    expect(trimTrailingSlashes('https://core.sovereign.local///')).toBe(
      'https://core.sovereign.local',
    );
    expect(trimTrailingSlashes('/auth/')).toBe('/auth');
    expect(trimTrailingSlashes('/a//b')).toBe('/a//b');
    expect(trimTrailingSlashes('///')).toBe('');
  });

  it('is linear on a long run of slashes that does not end the string', () => {
    const started = performance.now();
    trimTrailingSlashes(`${'/'.repeat(200_000)}x`);
    expect(performance.now() - started).toBeLessThan(100);
  });
});

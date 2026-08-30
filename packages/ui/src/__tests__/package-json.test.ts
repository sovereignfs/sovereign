import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';

describe('packages/ui/package.json — sideEffects', () => {
  it('declares sideEffects as exactly ["**/*.css"]', () => {
    expect(packageJson.sideEffects).toEqual(['**/*.css']);
  });
});

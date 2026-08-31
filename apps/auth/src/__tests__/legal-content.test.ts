import { describe, expect, it } from 'vitest';
import { getPolicyAcceptanceHash } from '../legal-content';

describe('getPolicyAcceptanceHash (GDPR-8, workstream 0021 leg 6)', () => {
  it('returns a deterministic sha256 hex digest of the real root PRIVACY.md/TOS.md', () => {
    const first = getPolicyAcceptanceHash();
    const second = getPolicyAcceptanceHash();
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });
});

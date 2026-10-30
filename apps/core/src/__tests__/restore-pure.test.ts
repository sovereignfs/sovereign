import { describe, expect, it } from 'vitest';
import { issuedBeforeRestore, openedBeforeRestore } from '../instance/restore';

describe('what a restore ends, judged by time', () => {
  const restored = Date.UTC(2026, 9, 31, 8, 0, 30, 500);
  const second = Math.floor(restored / 1000);

  it('ends nothing on an instance that was never restored', () => {
    expect(issuedBeforeRestore(undefined, 1)).toBe(false);
    expect(openedBeforeRestore(undefined, 1)).toBe(false);
  });

  it('ends a token issued before the restore, or in the same second, and not one issued after', () => {
    expect(issuedBeforeRestore(restored, second - 60)).toBe(true);
    expect(issuedBeforeRestore(restored, second)).toBe(true);
    expect(issuedBeforeRestore(restored, second + 1)).toBe(false);
  });

  it('ends a session opened at or before the restore, and not one opened after', () => {
    expect(openedBeforeRestore(restored, restored - 1)).toBe(true);
    expect(openedBeforeRestore(restored, restored)).toBe(true);
    expect(openedBeforeRestore(restored, restored + 1)).toBe(false);
  });
});

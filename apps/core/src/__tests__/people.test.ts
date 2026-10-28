import { describe, expect, it } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { mayActOn } from '../roles/people';

describe('who may act on whom (core-app §3.2.1)', () => {
  it.each([
    [ROLE_OWNER, ROLE_OWNER, true],
    [ROLE_OWNER, ROLE_ADMIN, true],
    [ROLE_OWNER, ROLE_USER, true],
    [ROLE_ADMIN, ROLE_OWNER, false],
    [ROLE_ADMIN, ROLE_ADMIN, false],
    [ROLE_ADMIN, ROLE_USER, true],
    [ROLE_USER, ROLE_OWNER, false],
    [ROLE_USER, ROLE_ADMIN, false],
    [ROLE_USER, ROLE_USER, false],
  ])('%s on %s: %s', (actor, target, expected) => {
    expect(mayActOn(actor, target)).toBe(expected);
  });

  it('is false whenever either role is not known', () => {
    for (const unknown of [undefined, null, '', 'platform:superuser', 'owner']) {
      expect(mayActOn(unknown, ROLE_USER)).toBe(false);
      expect(mayActOn(ROLE_OWNER, unknown)).toBe(false);
    }
  });

  it('lets only the owner act on an operator', () => {
    const operators = [ROLE_OWNER, ROLE_ADMIN];
    for (const actor of [ROLE_OWNER, ROLE_ADMIN, ROLE_USER]) {
      for (const target of operators) {
        expect(mayActOn(actor, target)).toBe(actor === ROLE_OWNER);
      }
    }
  });
});

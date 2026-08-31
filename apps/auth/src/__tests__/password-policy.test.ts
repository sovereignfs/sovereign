import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
  Reflect.deleteProperty(process.env, 'AUTH_PASSWORD_MIN_LENGTH');
  Reflect.deleteProperty(process.env, 'AUTH_PASSWORD_REQUIRE_UPPERCASE');
  Reflect.deleteProperty(process.env, 'AUTH_PASSWORD_REQUIRE_LOWERCASE');
  Reflect.deleteProperty(process.env, 'AUTH_PASSWORD_REQUIRE_NUMBER');
  Reflect.deleteProperty(process.env, 'AUTH_PASSWORD_REQUIRE_SYMBOL');
});

describe('getPasswordPolicy defaults', () => {
  it("reproduces today's policy (min length 8, no complexity rules) when unset", async () => {
    const { getPasswordPolicy } = await import('../password-policy');
    expect(getPasswordPolicy()).toEqual({
      minLength: 8,
      requireUppercase: false,
      requireLowercase: false,
      requireNumber: false,
      requireSymbol: false,
    });
  });

  it('reads AUTH_PASSWORD_MIN_LENGTH and the four require flags from env', async () => {
    process.env.AUTH_PASSWORD_MIN_LENGTH = '12';
    process.env.AUTH_PASSWORD_REQUIRE_UPPERCASE = 'true';
    process.env.AUTH_PASSWORD_REQUIRE_LOWERCASE = 'true';
    process.env.AUTH_PASSWORD_REQUIRE_NUMBER = 'true';
    process.env.AUTH_PASSWORD_REQUIRE_SYMBOL = 'true';
    const { getPasswordPolicy } = await import('../password-policy');
    expect(getPasswordPolicy()).toEqual({
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSymbol: true,
    });
  });

  it('falls back to the default min length for a non-numeric or non-positive value', async () => {
    process.env.AUTH_PASSWORD_MIN_LENGTH = 'not-a-number';
    const { getPasswordPolicy: getPasswordPolicyA } = await import('../password-policy');
    expect(getPasswordPolicyA().minLength).toBe(8);

    vi.resetModules();
    process.env.AUTH_PASSWORD_MIN_LENGTH = '0';
    const { getPasswordPolicy: getPasswordPolicyB } = await import('../password-policy');
    expect(getPasswordPolicyB().minLength).toBe(8);
  });

  it('caches the resolved policy until resetPasswordPolicyForTests is called', async () => {
    const { getPasswordPolicy, resetPasswordPolicyForTests } = await import('../password-policy');
    expect(getPasswordPolicy().requireUppercase).toBe(false);
    process.env.AUTH_PASSWORD_REQUIRE_UPPERCASE = 'true';
    expect(getPasswordPolicy().requireUppercase).toBe(false);
    resetPasswordPolicyForTests();
    expect(getPasswordPolicy().requireUppercase).toBe(true);
  });
});

describe('validatePasswordComplexity', () => {
  it('passes any password when every rule is off (the default)', async () => {
    const { validatePasswordComplexity } = await import('../password-policy');
    const policy = {
      minLength: 8,
      requireUppercase: false,
      requireLowercase: false,
      requireNumber: false,
      requireSymbol: false,
    };
    expect(validatePasswordComplexity('all lowercase no digits', policy)).toBeNull();
  });

  it('flags a missing uppercase letter', async () => {
    const { validatePasswordComplexity } = await import('../password-policy');
    const policy = {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: false,
      requireNumber: false,
      requireSymbol: false,
    };
    expect(validatePasswordComplexity('lowercase1', policy)).toContain('uppercase letter');
    expect(validatePasswordComplexity('Lowercase1', policy)).toBeNull();
  });

  it('flags a missing lowercase letter', async () => {
    const { validatePasswordComplexity } = await import('../password-policy');
    const policy = {
      minLength: 8,
      requireUppercase: false,
      requireLowercase: true,
      requireNumber: false,
      requireSymbol: false,
    };
    expect(validatePasswordComplexity('UPPERCASE1', policy)).toContain('lowercase letter');
    expect(validatePasswordComplexity('UPPERCASe1', policy)).toBeNull();
  });

  it('flags a missing number', async () => {
    const { validatePasswordComplexity } = await import('../password-policy');
    const policy = {
      minLength: 8,
      requireUppercase: false,
      requireLowercase: false,
      requireNumber: true,
      requireSymbol: false,
    };
    expect(validatePasswordComplexity('NoDigitsHere', policy)).toContain('a number');
    expect(validatePasswordComplexity('HasDigit1', policy)).toBeNull();
  });

  it('flags a missing symbol', async () => {
    const { validatePasswordComplexity } = await import('../password-policy');
    const policy = {
      minLength: 8,
      requireUppercase: false,
      requireLowercase: false,
      requireNumber: false,
      requireSymbol: true,
    };
    expect(validatePasswordComplexity('AlphaNumeric1', policy)).toContain('a symbol');
    expect(validatePasswordComplexity('AlphaNumeric1!', policy)).toBeNull();
  });

  it('joins every failed rule into one message when several are enabled', async () => {
    const { validatePasswordComplexity } = await import('../password-policy');
    const policy = {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSymbol: true,
    };
    const message = validatePasswordComplexity('short', policy);
    expect(message).toContain('uppercase letter');
    expect(message).toContain('a number');
    expect(message).toContain('a symbol');
  });

  it("does not check length — that is left to better-auth's own minPasswordLength", async () => {
    const { validatePasswordComplexity } = await import('../password-policy');
    const policy = {
      minLength: 20,
      requireUppercase: false,
      requireLowercase: false,
      requireNumber: false,
      requireSymbol: false,
    };
    expect(validatePasswordComplexity('short', policy)).toBeNull();
  });
});

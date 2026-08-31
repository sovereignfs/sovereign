/**
 * Configurable password complexity policy. Length is left to better-auth's
 * own `minPasswordLength`/`maxPasswordLength` checks (already correct, with
 * proper `PASSWORD_TOO_SHORT`/`PASSWORD_TOO_LONG` error codes) — this module
 * only covers complexity rules better-auth has no config surface for.
 *
 * Every rule defaults to off (and minLength to 8, today's hardcoded value),
 * so an operator who sets none of these env vars gets exactly today's
 * behavior. Wired into `auth.ts`'s `hooks.before` for `/sign-up/email`,
 * `/reset-password`, and `/change-password` — applied to all three so a
 * policy can't be bypassed by setting a weak password via reset/change right
 * after a compliant signup.
 */

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
}

const DEFAULT_MIN_LENGTH = 8;

let cached: PasswordPolicy | undefined;

function boolEnv(name: string): boolean {
  return process.env[name] === 'true';
}

export function getPasswordPolicy(): PasswordPolicy {
  cached ??= {
    minLength: (() => {
      const raw = Number(process.env.AUTH_PASSWORD_MIN_LENGTH);
      return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MIN_LENGTH;
    })(),
    requireUppercase: boolEnv('AUTH_PASSWORD_REQUIRE_UPPERCASE'),
    requireLowercase: boolEnv('AUTH_PASSWORD_REQUIRE_LOWERCASE'),
    requireNumber: boolEnv('AUTH_PASSWORD_REQUIRE_NUMBER'),
    requireSymbol: boolEnv('AUTH_PASSWORD_REQUIRE_SYMBOL'),
  };
  return cached;
}

/**
 * Checks `password` against every complexity rule `policy` has enabled.
 * Returns a human-readable violation message (all failed rules, joined) or
 * `null` if the password satisfies every enabled rule. Does not check
 * length — that's better-auth's own `minPasswordLength` check.
 */
export function validatePasswordComplexity(
  password: string,
  policy: PasswordPolicy = getPasswordPolicy(),
): string | null {
  const missing: string[] = [];
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    missing.push('an uppercase letter');
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    missing.push('a lowercase letter');
  }
  if (policy.requireNumber && !/[0-9]/.test(password)) {
    missing.push('a number');
  }
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    missing.push('a symbol');
  }
  if (missing.length === 0) return null;
  return `Password must include ${missing.join(', ')}.`;
}

export function resetPasswordPolicyForTests(): void {
  cached = undefined;
}

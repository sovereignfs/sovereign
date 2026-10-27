export interface PasswordPolicy {
  minLength: number;
  /** better-auth's own ceiling; a longer password costs more to hash than any person needs. */
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
}

/** The longest password accepted: hashing cost grows with length, so it is bounded. */
export const MAX_PASSWORD_LENGTH = 128;

/**
 * What a password lacks, in the words of a sentence that starts "The password must…", or an empty
 * list when it meets the policy. The server enforces this (core-app §3.3.2); the page only explains
 * it. Classes are Unicode: `é` is a lower-case letter, not a symbol, and a symbol is anything that
 * is neither a letter nor a digit (a space counts).
 */
export function passwordProblems(password: string, policy: PasswordPolicy): string[] {
  const problems: string[] = [];
  if (password.length < policy.minLength) {
    problems.push(`be at least ${policy.minLength} characters long`);
  }
  if (password.length > policy.maxLength) {
    problems.push(`be at most ${policy.maxLength} characters long`);
  }
  if (policy.requireUppercase && !/\p{Lu}/u.test(password))
    problems.push('include an uppercase letter');
  if (policy.requireLowercase && !/\p{Ll}/u.test(password))
    problems.push('include a lowercase letter');
  if (policy.requireNumber && !/\p{Nd}/u.test(password)) problems.push('include a number');
  if (policy.requireSymbol && !/[^\p{L}\p{N}]/u.test(password)) problems.push('include a symbol');
  return problems;
}

/** The one-sentence form of the policy, for the sign-up page and for errors. */
export function describePasswordPolicy(policy: PasswordPolicy): string {
  const extras: string[] = [];
  if (policy.requireUppercase) extras.push('an uppercase letter');
  if (policy.requireLowercase) extras.push('a lowercase letter');
  if (policy.requireNumber) extras.push('a number');
  if (policy.requireSymbol) extras.push('a symbol');
  const base = `At least ${policy.minLength} characters`;
  if (extras.length === 0) return `${base}.`;
  const last = extras.pop();
  const list = extras.length > 0 ? `${extras.join(', ')} and ${last}` : last;
  return `${base}, with ${list}.`;
}

/** The error message for a password that does not meet the policy. */
export function passwordPolicyMessage(problems: readonly string[]): string {
  return `The password must ${problems.join(' and ')}.`;
}

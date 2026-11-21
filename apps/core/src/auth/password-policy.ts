/** The password policy is the sign-in package's (auth.md §6), shared by the pages and the settings. */
export {
  describePasswordPolicy,
  MAX_PASSWORD_LENGTH,
  newPasswordProblem,
  PAGE_NOT_READY,
  passwordPolicyMessage,
  passwordProblems,
  type PasswordPolicy,
} from '@sovereignfs/auth';

/**
 * Which runtime exports are stable and which are experimental (sdk §12), by entry point. A stable export follows the rules of
 * the design system's versioning (design-system §3 and §4): it does not break in a patch. The specification lists the stable
 * ones: `createSovereign`, the error types of §6, §4's actors and §8's capabilities. Everything else is experimental, and a
 * test holds this list to what each entry exports and to the specification.
 *
 * Types are not listed: an actor or a capability is a type, stable as the specification says.
 */
export const STABLE = {
  '.': [
    'createSovereign',
    'SovereignError',
    'ConfigurationError',
    'CoreApiError',
    'CoreUnavailableError',
    'SessionEndedError',
    'NotSupportedError',
  ],
  './next': [],
  './testing': [],
} as const;

export const EXPERIMENTAL = {
  '.': ['hasRole', 'NotAuthenticatedError', 'SignInError'],
  './next': ['nextAuth'],
  './testing': ['createFakeCore', 'memorySessionStore'],
} as const;

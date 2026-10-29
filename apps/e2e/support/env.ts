/** The addresses the suite runs on. Core is the instance under test; the two test apps are its clients. */
export const CORE_PORT = 3100;
export const CORE_URL = `http://localhost:${CORE_PORT}`;

/** The off-the-shelf OpenID Connect relying party (`openid-client`), run as an app. */
export const RP_PORT = 3101;
export const RP_URL = `http://localhost:${RP_PORT}`;

/** The second, minimal client: raw requests, no library, public (no secret) with PKCE. */
export const MINIMAL_PORT = 3102;
export const MINIMAL_URL = `http://localhost:${MINIMAL_PORT}`;

/** The password every account in the suite has. It satisfies core's default policy. */
export const PASSWORD = 'Acceptance-Test-9Qx';

export const person = (name: string) => ({
  name,
  email: `${name.toLowerCase()}@example.test`,
  password: PASSWORD,
});

let nextAddress = 10;
/** A client address of its own: core limits sign-in and sign-up attempts for each address, and people are not all one address. */
export const freshAddress = (): string => `198.51.100.${nextAddress++ % 250}`;

/**
 * Core refuses a token issued in the same second a revocation was recorded: the doubt goes against the token. A step
 * that removes an app's access and then needs a token it asks for next waits out that second first.
 */
export const pastTheSecond = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 1100));

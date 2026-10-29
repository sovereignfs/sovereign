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

import { NextResponse } from 'next/server';

// SOVEREIGN_AUTH_PUBLIC_URL is the browser-facing base URL for the auth server.
// It differs from SOVEREIGN_AUTH_URL in Docker setups where SOVEREIGN_AUTH_URL
// is an internal service name (http://auth:3001) that the browser cannot resolve.
// Set SOVEREIGN_AUTH_PUBLIC_URL to the host-reachable URL (e.g. http://localhost:3001)
// and leave SOVEREIGN_AUTH_URL as the internal address for server-side API calls.
const AUTH_PUBLIC_URL =
  process.env.SOVEREIGN_AUTH_PUBLIC_URL ??
  process.env.SOVEREIGN_AUTH_URL ??
  'http://localhost:3001';

// The login/registration UI lives in apps/auth (SRS §3.3). Redirect there; the
// auth server redirects back to the runtime after a successful sign-in.
export function GET(): Response {
  return NextResponse.redirect(`${AUTH_PUBLIC_URL}/login`);
}

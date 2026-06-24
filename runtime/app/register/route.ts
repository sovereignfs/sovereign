import { NextResponse } from 'next/server';

const AUTH_URL = process.env.SOVEREIGN_AUTH_URL ?? 'http://localhost:3001';

// The registration UI lives in apps/auth (SRS §3.3). Redirect there, forwarding
// any query params (e.g. ?token= from invite links) so the auth server can read them.
export function GET(request: Request): Response {
  const { search } = new URL(request.url);
  return NextResponse.redirect(`${AUTH_URL}/register${search}`);
}

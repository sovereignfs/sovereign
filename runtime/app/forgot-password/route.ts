import { NextResponse } from 'next/server';

const AUTH_PUBLIC_URL =
  process.env.SOVEREIGN_AUTH_PUBLIC_URL ??
  process.env.SOVEREIGN_AUTH_URL ??
  'http://localhost:3001';

// Password reset is handled entirely by the auth server. This redirect is
// intentional — users reach this page via email link, not the PWA daily flow.
export function GET(req: Request): Response {
  const search = new URL(req.url).search;
  return NextResponse.redirect(`${AUTH_PUBLIC_URL}/forgot-password${search}`, 303);
}

import { NextResponse } from 'next/server';
import { getConfig } from '../../src/config';
import { getInstanceIdentity } from '../../src/instance/service';

// Next treats this path as its own icon convention and would make it static, frozen at the build's value: the
// favicon an operator sets in the Console is read on every request.
export const dynamic = 'force-dynamic';

/**
 * Browsers ask for `/favicon.ico` whatever the page's own links say, so it answers with the instance's favicon,
 * or the default one, by sending the browser to it.
 */
export async function GET(): Promise<Response> {
  const { favicon } = await getInstanceIdentity();
  const target = new URL(favicon ?? '/icons/favicon.ico', getConfig().url);
  const response = NextResponse.redirect(target, 307);
  response.headers.set('cache-control', 'no-cache');
  return response;
}

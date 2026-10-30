import { createHash } from 'node:crypto';
import { BrandingStore } from '../../../src/branding/store';
import { getConfig } from '../../../src/config';
import { getDatabase } from '../../../src/database';
import { brandingDocument } from '../../../src/instance/branding-document';
import { loadIdentity } from '../../../src/instance/identity';
import { getMailForAppsService } from '../../../src/mail';
import { getSettings } from '../../../src/settings';

// What the operator has set now, read on every request: a change in the Console is here at once, with no restart.
export const dynamic = 'force-dynamic';

/**
 * The instance's name, logos and favicon (core-app §3.13, `getInstanceBranding` in the Core API contract).
 * Public on purpose: an app shows it with no account and no token, and its pages may fetch it from another
 * origin, so it allows any origin to read it (it carries no credentials and nothing private). It is revalidated
 * on every use and carries an ETag, so a change shows at once and an unchanged answer costs no body.
 */
export async function GET(request: Request): Promise<Response> {
  const [database, settings] = await Promise.all([getDatabase(), getSettings()]);
  const config = getConfig();
  const identity = await loadIdentity(settings, new BrandingStore(database), config.url);
  // Email is listed while the instance can send it, so an app can tell a lack of mail from a failure (core-app §4.2).
  const email = await (await getMailForAppsService()).available();
  const body = JSON.stringify(brandingDocument(identity, config.url, { email }));
  const etag = `"${createHash('sha256').update(body).digest('hex').slice(0, 16)}"`;
  const headers = {
    etag,
    'cache-control': 'public, max-age=0, must-revalidate',
    'access-control-allow-origin': '*',
    'x-content-type-options': 'nosniff',
  };
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { headers: { ...headers, 'content-type': 'application/json' } });
}

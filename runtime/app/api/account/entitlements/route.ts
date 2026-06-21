import { NextResponse } from 'next/server';
import {
  cancelEntitlement,
  getActiveEntitlement,
  listUserEntitlements,
  saveEntitlement,
} from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';
import { getInstalledPlugins } from '@/src/registry';
import { verifyLicenseToken, resolvePluginPublicKey } from '@/src/license';
import { logActivity } from '@/src/activity';

/** GET /api/account/entitlements — list current user's entitlements. */
export async function GET(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const pdb = await getPlatformDb();
  const rows = await listUserEntitlements(pdb, userId);

  // Enrich with plugin display name.
  const plugins = getInstalledPlugins();
  const pluginMap = new Map(plugins.map((p) => [p.id, p]));

  const entitlements = rows.map((row) => ({
    ...row,
    pluginName: pluginMap.get(row.pluginId)?.name ?? row.pluginId,
    active:
      row.status === 'active' &&
      (row.expiresAt == null || row.expiresAt > Math.floor(Date.now() / 1000)),
  }));

  return NextResponse.json({ entitlements });
}

/**
 * POST /api/account/entitlements — import a signed license token.
 *
 * Accepts both JSON (`Content-Type: application/json`) and form data
 * (posted by the paywall page's `<form>`).
 *
 * Body: `{ pluginId, licenseToken, returnPath? }`.
 * On success: returns 200 JSON (API) or 303 redirect to `returnPath` (form).
 */
export async function POST(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let pluginId: string | undefined;
  let licenseToken: string | undefined;
  let returnPath: string | undefined;
  const isForm =
    request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded') ?? false;

  if (isForm) {
    const data = await request.formData();
    pluginId = (data.get('pluginId') as string | null) ?? undefined;
    licenseToken = (data.get('licenseToken') as string | null) ?? undefined;
    returnPath = (data.get('returnPath') as string | null) ?? undefined;
  } else {
    const body = (await request.json()) as {
      pluginId?: string;
      licenseToken?: string;
      returnPath?: string;
    };
    pluginId = body.pluginId;
    licenseToken = body.licenseToken;
    returnPath = body.returnPath;
  }

  if (!pluginId || !licenseToken) {
    const err = NextResponse.json(
      { error: 'pluginId and licenseToken are required' },
      { status: 400 },
    );
    return err;
  }

  // Errors always redirect back to the paywall so the user can retry.
  const paywallPath = `/paywall/${encodeURIComponent(pluginId)}`;

  // Find the plugin manifest for the public key.
  const plugin = getInstalledPlugins().find((p) => p.id === pluginId);
  if (!plugin) {
    const err = NextResponse.json({ error: 'Plugin not found.' }, { status: 404 });
    if (isForm) return redirectBack(paywallPath, err, 'Plugin not found.');
    return err;
  }

  if (!plugin.monetization || plugin.monetization.model === 'free') {
    const err = NextResponse.json(
      { error: 'This plugin is free — no license required.' },
      { status: 400 },
    );
    if (isForm) return redirectBack(plugin.routePrefix, err, 'This plugin is free.');
    return err;
  }

  const publicKey = await resolvePluginPublicKey(pluginId);
  if (!publicKey) {
    const err = NextResponse.json(
      { error: 'No license public key found for this plugin (manifest or instance storage).' },
      { status: 500 },
    );
    if (isForm) return redirectBack(paywallPath, err, 'No public key configured.');
    return err;
  }

  const result = verifyLicenseToken(licenseToken.trim(), publicKey, pluginId);
  if (!result.valid || !result.payload) {
    const errMsg = result.error ?? 'Invalid license token.';
    const err = NextResponse.json({ error: errMsg }, { status: 422 });
    if (isForm) return redirectBack(paywallPath, err, errMsg);
    return err;
  }

  const { payload } = result;

  // Check if the user already has an active entitlement.
  const pdb = await getPlatformDb();
  const existing = await getActiveEntitlement(pdb, userId, pluginId);
  if (existing) {
    // Overwrite by cancelling the old one and saving the new one.
    await cancelEntitlement(pdb, existing.id);
  }

  const id = crypto.randomUUID();
  await saveEntitlement(pdb, {
    id,
    userId,
    pluginId,
    tierId: payload.tier ?? null,
    status: 'active',
    source: 'manual',
    licenseToken: licenseToken.trim(),
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt ?? null,
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
  });

  void logActivity({
    actorId: userId,
    actorType: 'user',
    action: 'account.license_imported',
    targetType: 'plugin',
    targetId: pluginId,
    summary: `Imported license for ${plugin.name}${payload.tier ? ` (${payload.tier} tier)` : ''}`,
    visibility: 'user',
  });

  if (isForm) {
    const dest =
      returnPath && returnPath !== `/paywall/${encodeURIComponent(pluginId)}`
        ? returnPath
        : plugin.routePrefix;
    return new Response(null, {
      status: 303,
      headers: { location: dest },
    });
  }

  return NextResponse.json({ ok: true, entitlementId: id });
}

/** DELETE /api/account/entitlements?id=<id> — cancel an entitlement. */
export async function DELETE(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const pdb = await getPlatformDb();
  const rows = await listUserEntitlements(pdb, userId);
  const owned = rows.find((r) => r.id === id);
  if (!owned) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  await cancelEntitlement(pdb, id);

  void logActivity({
    actorId: userId,
    actorType: 'user',
    action: 'account.license_cancelled',
    targetType: 'plugin',
    targetId: owned.pluginId,
    summary: `Cancelled entitlement for plugin ${owned.pluginId}`,
    visibility: 'user',
  });

  return NextResponse.json({ ok: true });
}

/** Redirect back to a URL, appending an error message as a query param. */
function redirectBack(_url: string, _errResponse: Response, _message: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location: _url.includes('?')
        ? `${_url}&error=${encodeURIComponent(_message)}`
        : `${_url}?error=${encodeURIComponent(_message)}`,
    },
  });
}

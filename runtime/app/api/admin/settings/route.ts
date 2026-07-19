import { NextResponse } from 'next/server';
import {
  DEFAULT_ROOT_PLUGIN_ID,
  getDefaultTenant,
  getPlatformSetting,
  setPlatformSetting,
  setTenantName,
} from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';
import {
  EXAMPLES_ENABLED_SETTING,
  getDisabledPluginIds,
  getExamplesEnabledFlag,
} from '@/src/plugin-status';
import { getInstalledPlugins } from '@/src/registry';
import { validateRootPlugin } from '@/src/root-plugin';
import { readStoredSmtpSettings, writeStoredSmtpSettings } from '@/src/smtp-settings';

const AUTH_URL =
  process.env.SOVEREIGN_AUTH_URL ?? `http://localhost:${process.env.AUTH_PORT ?? '3001'}`;

/** `env` when nothing is stored, `console` when every set field is stored, `mixed` otherwise. */
function smtpSource(stored: {
  host: string | null;
  port: number | null;
  user: string | null;
  from: string | null;
  hasPassword: boolean;
}): 'env' | 'console' | 'mixed' {
  const storedCount =
    [stored.host, stored.port, stored.user, stored.from].filter((v) => v !== null).length +
    (stored.hasPassword ? 1 : 0);
  if (storedCount === 0) return 'env';
  if (stored.host !== null) return 'console';
  return 'mixed';
}

async function readSettings() {
  const db = await getPlatformDb();
  const [tenant, inviteOnly, rootPluginId, examplesEnabled, smtp] = await Promise.all([
    getDefaultTenant(db),
    getPlatformSetting(db, 'invite_only'),
    getPlatformSetting(db, 'root_plugin_id'),
    getExamplesEnabledFlag(db),
    readStoredSmtpSettings(db),
  ]);
  return {
    tenantName: tenant.name,
    inviteOnly: inviteOnly === 'true',
    rootPluginId: rootPluginId ?? DEFAULT_ROOT_PLUGIN_ID,
    examplesEnabled,
    smtp: { ...smtp, source: smtpSource(smtp) },
  };
}

export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;
  return NextResponse.json(await readSettings());
}

export async function PATCH(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json()) as {
    tenantName?: string;
    inviteOnly?: boolean;
    rootPluginId?: string;
    examplesEnabled?: boolean;
    smtp?: { host?: string; port?: number; user?: string; pass?: string; from?: string };
  };
  const db = await getPlatformDb();
  const actorId = request.headers.get('x-sovereign-user-id');

  if (body.tenantName !== undefined) {
    const name = body.tenantName.trim();
    if (name.length === 0) {
      return NextResponse.json({ error: 'tenantName must not be empty' }, { status: 400 });
    }
    await setTenantName(db, name);
    void logActivity({
      actorId,
      actorType: 'user',
      action: 'settings.instance_name_changed',
      visibility: 'admin',
      summary: `Instance name changed to "${name}"`,
      metadata: { tenantName: name },
    });
  }

  if (body.rootPluginId !== undefined) {
    const disabledIds = new Set(await getDisabledPluginIds(db));
    const result = validateRootPlugin(body.rootPluginId, getInstalledPlugins(), disabledIds);
    if (!result.ok) {
      return NextResponse.json(
        { error: `rootPluginId rejected: ${result.reason}` },
        { status: 400 },
      );
    }
    await setPlatformSetting(db, 'root_plugin_id', body.rootPluginId);
    void logActivity({
      actorId,
      actorType: 'user',
      action: 'settings.root_plugin_changed',
      visibility: 'admin',
      summary: `Root plugin changed to ${body.rootPluginId}`,
      metadata: { rootPluginId: body.rootPluginId },
    });
  }

  if (body.inviteOnly !== undefined) {
    if (typeof body.inviteOnly !== 'boolean') {
      return NextResponse.json({ error: 'inviteOnly must be a boolean' }, { status: 400 });
    }
    // Dual-write: the platform copy backs sdk.platform.getConfig(); the auth
    // server's copy is what registration actually enforces (CON-10).
    const authRes = await fetch(`${AUTH_URL}/api/admin/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: request.headers.get('authorization') ?? '',
      },
      body: JSON.stringify({ inviteOnly: body.inviteOnly }),
    });
    if (!authRes.ok) {
      return NextResponse.json(
        { error: `auth server rejected invite-only update: ${authRes.status}` },
        { status: 502 },
      );
    }
    await setPlatformSetting(db, 'invite_only', String(body.inviteOnly));
    void logActivity({
      actorId,
      actorType: 'user',
      action: 'settings.invite_only_changed',
      visibility: 'admin',
      summary: `Invite-only ${body.inviteOnly ? 'enabled' : 'disabled'}`,
      metadata: { inviteOnly: body.inviteOnly },
    });
  }

  if (body.examplesEnabled !== undefined) {
    if (typeof body.examplesEnabled !== 'boolean') {
      return NextResponse.json({ error: 'examplesEnabled must be a boolean' }, { status: 400 });
    }
    // Sets the instance-wide default for the bundled example apps (overrides the
    // SOVEREIGN_EXAMPLES_ENABLED env seed). Per-plugin toggles still win over it.
    await setPlatformSetting(db, EXAMPLES_ENABLED_SETTING, String(body.examplesEnabled));
    void logActivity({
      actorId,
      actorType: 'user',
      action: 'settings.examples_visibility_changed',
      visibility: 'admin',
      summary: `Example apps ${body.examplesEnabled ? 'shown' : 'hidden'}`,
      metadata: { examplesEnabled: body.examplesEnabled },
    });
  }

  if (body.smtp !== undefined) {
    const { host, port, user, pass, from } = body.smtp;
    if (host !== undefined && host.trim().length === 0) {
      return NextResponse.json({ error: 'smtp.host must not be empty' }, { status: 400 });
    }
    if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      return NextResponse.json(
        { error: 'smtp.port must be an integer between 1 and 65535' },
        { status: 400 },
      );
    }
    // Dual-write: the platform copy is what runtime's own mailer resolves;
    // the auth server keeps its own local copy so its mailer (password
    // reset, email verification) doesn't depend on a live call to runtime.
    const authRes = await fetch(`${AUTH_URL}/api/admin/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: request.headers.get('authorization') ?? '',
      },
      body: JSON.stringify({ smtp: { host, port, user, pass, from } }),
    });
    if (!authRes.ok) {
      return NextResponse.json(
        { error: `auth server rejected SMTP settings update: ${authRes.status}` },
        { status: 502 },
      );
    }
    await writeStoredSmtpSettings(db, { host, port, user, pass, from });
    void logActivity({
      actorId,
      actorType: 'user',
      action: 'settings.smtp_changed',
      visibility: 'admin',
      summary: 'SMTP settings changed',
      metadata: { host, port, user, from, hasPassword: !!pass },
    });
  }

  return NextResponse.json(await readSettings());
}

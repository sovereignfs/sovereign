import { NextResponse } from 'next/server';
import {
  DEFAULT_ROOT_PLUGIN_ID,
  DEFAULT_TENANT_ID,
  deletePlatformSetting,
  getDefaultTenant,
  getPlatformSetting,
  setPlatformSetting,
  setTenantName,
  countE2eeProfiles,
  encryptClassesFromEnv,
  fieldKekFromEnv,
  listFieldTableRegistrations,
  listOpenHmacRotations,
} from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { logActivity } from '@/src/activity';
import { getPlatformDb } from '@/src/db';
import {
  EXAMPLES_ENABLED_SETTING,
  getDisabledPluginIds,
  getExamplesEnabledFlag,
} from '@/src/plugin-status';
import { getExamplePluginIds, getInstalledPlugins } from '@/src/registry';
import { DEFAULT_RELAY_URL, RELAY_DISABLED_SETTING, RELAY_URL_SETTING } from '@/src/relay';
import {
  RETENTION_ACTIVITY_LOG_DAYS_SETTING,
  RETENTION_DELIVERY_LOGS_DAYS_SETTING,
  parseRetentionDays,
} from '@/src/retention-worker';
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
  const [
    tenant,
    inviteOnly,
    rootPluginId,
    examplesEnabled,
    smtp,
    pushRelayUrl,
    pushRelayDisabled,
    retentionDeliveryLogsDays,
    retentionActivityLogDays,
    e2eeProfileCount,
  ] = await Promise.all([
    getDefaultTenant(db),
    getPlatformSetting(db, 'invite_only'),
    getPlatformSetting(db, 'root_plugin_id'),
    getExamplesEnabledFlag(db),
    readStoredSmtpSettings(db),
    getPlatformSetting(db, RELAY_URL_SETTING),
    getPlatformSetting(db, RELAY_DISABLED_SETTING),
    getPlatformSetting(db, RETENTION_DELIVERY_LOGS_DAYS_SETTING),
    getPlatformSetting(db, RETENTION_ACTIVITY_LOG_DAYS_SETTING),
    countE2eeProfiles(db, DEFAULT_TENANT_ID),
  ]);
  // App-level field encryption status (RFC 0092) — read-only diagnostics for
  // Console. Best-effort: a database from before migration 0022/0023 simply
  // reports the feature as off rather than failing the whole settings read.
  let fieldEncryption: {
    enabledClasses: string[];
    kekConfigured: boolean;
    openRotations: { pluginId: string; class: string; openedDaysAgo: number }[];
    registrations: { pluginId: string; tableCount: number }[];
  } = { enabledClasses: [], kekConfigured: false, openRotations: [], registrations: [] };
  try {
    const now = Math.floor(Date.now() / 1000);
    const [openRotations, registrations] = await Promise.all([
      listOpenHmacRotations(db),
      listFieldTableRegistrations(db),
    ]);
    const perPlugin = new Map<string, number>();
    for (const r of registrations) {
      perPlugin.set(r.pluginId, (perPlugin.get(r.pluginId) ?? 0) + 1);
    }
    fieldEncryption = {
      enabledClasses: encryptClassesFromEnv(),
      kekConfigured: fieldKekFromEnv() !== undefined,
      openRotations: openRotations.map((r) => ({
        pluginId: r.pluginId,
        class: r.class,
        openedDaysAgo: Math.floor((now - (r.hmacRotationStartedAt ?? now)) / 86400),
      })),
      registrations: [...perPlugin.entries()].map(([pluginId, tableCount]) => ({
        pluginId,
        tableCount,
      })),
    };
  } catch {
    // pre-migration database — leave the safe default
  }

  return {
    tenantName: tenant.name,
    inviteOnly: inviteOnly === 'true',
    rootPluginId: rootPluginId ?? DEFAULT_ROOT_PLUGIN_ID,
    examplesEnabled,
    // Whether any bundled example plugin was actually composed into this build
    // (SOVEREIGN_EXAMPLES_ENABLED at build time) — distinct from `examplesEnabled`,
    // which is the persisted visibility toggle. A build with examples off never has
    // any `example: true` manifest in the registry, so Console hides the toggle
    // entirely rather than showing a control with nothing to reveal.
    hasExamplePlugins: getExamplePluginIds(getInstalledPlugins()).length > 0,
    smtp: { ...smtp, source: smtpSource(smtp) },
    fieldEncryption,
    pushRelay: {
      // null url = using the default below, not "unconfigured" — distinct
      // from `disabled`, per RFC 0087's "distinct, explicit full opt-out"
      // requirement (an empty/unset URL must keep meaning "use the default",
      // never get conflated with turning the relay off).
      url: pushRelayUrl,
      defaultUrl: DEFAULT_RELAY_URL,
      disabled: pushRelayDisabled === 'true',
    },
    // null = no window configured = never pruned (GDPR-7) — distinct from a
    // window of e.g. 0, which parseRetentionDays never accepts as valid.
    retention: {
      deliveryLogsDays: parseRetentionDays(retentionDeliveryLogsDays),
      activityLogDays: parseRetentionDays(retentionActivityLogDays),
    },
    // GDPR-9 (workstream 0021 leg 7) — the platform's own knowledge of
    // at-rest encryption coverage, computed from real state, never a static
    // claim. A real enrolled-profile count, not a manifest permission check:
    // `e2ee:use` exists in `permissionSchema` but nothing enforces it and no
    // installed plugin declares it, even though Account genuinely has E2EE
    // features — the permission string isn't a trustworthy adoption signal,
    // so this counts actual `e2ee_profiles` rows instead. Deliberately does
    // NOT attempt to detect host-disk encryption — the app has no way to
    // observe that from inside the container.
    atRestEncryption: { e2eeProfileCount },
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
    pushRelay?: { url?: string | null; disabled?: boolean };
    retention?: { deliveryLogsDays?: number | null; activityLogDays?: number | null };
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

  if (body.pushRelay !== undefined) {
    const { url, disabled } = body.pushRelay;
    if (url !== undefined) {
      if (url === null) {
        // Explicit "clear" — revert to the default/env-derived URL. Distinct
        // from an empty string, which is rejected below rather than silently
        // treated the same way.
        await deletePlatformSetting(db, RELAY_URL_SETTING);
      } else {
        const trimmed = url.trim();
        if (trimmed.length === 0) {
          return NextResponse.json(
            { error: 'pushRelay.url must not be empty — pass null to clear it' },
            { status: 400 },
          );
        }
        try {
          const parsed = new URL(trimmed);
          if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error();
        } catch {
          return NextResponse.json(
            { error: 'pushRelay.url must be a valid http(s) URL' },
            { status: 400 },
          );
        }
        await setPlatformSetting(db, RELAY_URL_SETTING, trimmed);
      }
    }
    if (disabled !== undefined) {
      if (typeof disabled !== 'boolean') {
        return NextResponse.json(
          { error: 'pushRelay.disabled must be a boolean' },
          { status: 400 },
        );
      }
      await setPlatformSetting(db, RELAY_DISABLED_SETTING, String(disabled));
    }
    void logActivity({
      actorId,
      actorType: 'user',
      action: 'settings.push_relay_changed',
      visibility: 'admin',
      summary:
        disabled === true
          ? 'Push relay disabled'
          : disabled === false
            ? 'Push relay enabled'
            : 'Push relay URL changed',
      metadata: { url: url ?? undefined, disabled },
    });
  }

  if (body.retention !== undefined) {
    const { deliveryLogsDays, activityLogDays } = body.retention;
    const validate = (value: number | null | undefined, field: string): Response | null => {
      if (value === undefined || value === null) return null;
      if (!Number.isInteger(value) || value < 1) {
        return NextResponse.json(
          { error: `retention.${field} must be a positive integer, or null to disable pruning` },
          { status: 400 },
        );
      }
      return null;
    };
    const deliveryError = validate(deliveryLogsDays, 'deliveryLogsDays');
    if (deliveryError) return deliveryError;
    const activityError = validate(activityLogDays, 'activityLogDays');
    if (activityError) return activityError;

    if (deliveryLogsDays !== undefined) {
      if (deliveryLogsDays === null) {
        await deletePlatformSetting(db, RETENTION_DELIVERY_LOGS_DAYS_SETTING);
      } else {
        await setPlatformSetting(
          db,
          RETENTION_DELIVERY_LOGS_DAYS_SETTING,
          String(deliveryLogsDays),
        );
      }
    }
    if (activityLogDays !== undefined) {
      if (activityLogDays === null) {
        await deletePlatformSetting(db, RETENTION_ACTIVITY_LOG_DAYS_SETTING);
      } else {
        await setPlatformSetting(db, RETENTION_ACTIVITY_LOG_DAYS_SETTING, String(activityLogDays));
      }
    }
    void logActivity({
      actorId,
      actorType: 'user',
      action: 'settings.retention_changed',
      visibility: 'admin',
      summary: 'Log retention settings changed',
      metadata: { deliveryLogsDays, activityLogDays },
    });
  }

  return NextResponse.json(await readSettings());
}

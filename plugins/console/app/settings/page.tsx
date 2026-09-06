import Link from 'next/link';
import { sdk } from '@sovereignfs/sdk';
import { Badge } from '@sovereignfs/ui';
import { ConsolePageHeader } from '../_components/ConsolePageHeader';
import styles from '../console.module.css';
import { ProviderConfigsSection, type ProviderConfigRow } from './ProviderConfigForms';
import { AtRestEncryptionOverview, type AtRestEncryptionView } from './AtRestEncryptionOverview';
import { FieldEncryptionStatus, type FieldEncryptionView } from './FieldEncryptionStatus';
import { PushRelaySettingsForm, type PushRelaySettingsView } from './PushRelaySettingsForm';
import { RetentionSettingsForm, type RetentionSettingsView } from './RetentionSettingsForm';
import { TenantForm, InviteOnlyForm, ExampleAppsForm, RootPluginForm } from './SettingsForms';
import { SmtpSettingsForm, type SmtpSettingsView } from './SmtpSettingsForm';
import { EmailTemplatesForm } from './EmailTemplatesForm';
import { renderFetchSignal } from '../_lib/fetch-timeout';

const SELF_URL = `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;

interface Settings {
  tenantName: string;
  inviteOnly: boolean;
  examplesEnabled: boolean;
  hasExamplePlugins: boolean;
  rootPluginId: string;
  smtp: SmtpSettingsView;
  fieldEncryption: FieldEncryptionView;
  atRestEncryption: AtRestEncryptionView;
  pushRelay: PushRelaySettingsView;
  retention: RetentionSettingsView;
}

interface PluginRow {
  id: string;
  name: string;
  adminOnly: boolean;
  shell: string;
  enabled: boolean;
}

interface ExternalConnection {
  id: string;
  pluginId: string;
  scope: 'user' | 'plugin' | 'instance';
  userId: string | null;
  provider: string;
  label: string;
  status: 'connected' | 'needs_reauth' | 'paused' | 'disconnected' | 'error';
  updatedAt: number;
  lastUsedAt: number | null;
  disconnectedAt: number | null;
}

async function adminGet<T>(path: string): Promise<T> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const res = await fetch(`${SELF_URL}${path}`, {
    headers: { Authorization: `Bearer ${adminKey}` },
    cache: 'no-store',
    signal: renderFetchSignal(),
  });
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

const DEFAULT_SETTINGS: Settings = {
  tenantName: 'Sovereign',
  inviteOnly: false,
  examplesEnabled: false,
  hasExamplePlugins: false,
  rootPluginId: '',
  smtp: { host: null, port: null, user: null, from: null, hasPassword: false, source: 'env' },
  fieldEncryption: {
    enabledClasses: [],
    kekConfigured: false,
    openRotations: [],
    registrations: [],
  },
  atRestEncryption: { e2eeProfileCount: 0 },
  pushRelay: { url: null, defaultUrl: 'https://relay.sovereign.openfs.io', disabled: false },
  retention: { deliveryLogsDays: null, activityLogDays: null },
};

function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function ConnectionStatusBadge({ status }: { status: ExternalConnection['status'] }) {
  switch (status) {
    case 'connected':
      return (
        <Badge variant="status" size="sm" status="active">
          Connected
        </Badge>
      );
    case 'needs_reauth':
      return (
        <Badge variant="status" size="sm" status="pending">
          Needs re-authorisation
        </Badge>
      );
    case 'paused':
      return (
        <Badge variant="status" size="sm" status="neutral">
          Paused
        </Badge>
      );
    case 'disconnected':
      return (
        <Badge variant="status" size="sm" status="deactivated">
          Disconnected
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="status" size="sm" status="failed">
          Error
        </Badge>
      );
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.overviewSection}>
      <h3 className={styles.overviewSectionTitle}>{title}</h3>
      {children}
    </div>
  );
}

export default async function SettingsPage() {
  const [settingsResult, pluginsResult] = await Promise.allSettled([
    adminGet<Settings>('/api/admin/settings'),
    adminGet<PluginRow[]>('/api/admin/plugins'),
  ]);
  const session = await sdk.auth.getSession();
  const canConfigureSecrets = sdk.auth.hasCapability(session, 'instance:configure-secrets');
  const connectionsResult = await adminGet<{ connections: ExternalConnection[] }>(
    '/api/admin/connections',
  ).catch(() => ({ connections: [] }));
  const providerConfigsResult = await adminGet<{ providers: ProviderConfigRow[] }>(
    '/api/admin/provider-configs',
  ).catch(() => ({ providers: [] }));
  const settings = settled(settingsResult, DEFAULT_SETTINGS);
  const plugins = settled(pluginsResult, [] as PluginRow[]);
  const connections = connectionsResult.connections;
  const providerConfigs = providerConfigsResult.providers;

  const rootCandidates = plugins.filter((p) => p.enabled && !p.adminOnly && p.shell !== 'overlay');
  const rootInstalled = rootCandidates.some((p) => p.id === settings.rootPluginId);

  return (
    <div>
      <ConsolePageHeader
        title="Settings"
        description="Instance-wide configuration: registration, the root app, email, push, retention and encryption status."
      />

      <Section title="Instance name">
        <TenantForm initialName={settings.tenantName} />
      </Section>

      <Section title="Registration">
        <InviteOnlyForm initialValue={settings.inviteOnly} />
      </Section>

      {settings.hasExamplePlugins && (
        <Section title="Example apps">
          <ExampleAppsForm initialValue={settings.examplesEnabled} />
        </Section>
      )}

      <Section title="Root app">
        <RootPluginForm
          candidates={rootCandidates.map((p) => ({ id: p.id, name: p.name }))}
          currentId={settings.rootPluginId}
          currentInstalled={rootInstalled}
        />
        <p className={styles.helpText}>
          Currently serving <code className={styles.codeInline}>{settings.rootPluginId}</code> at{' '}
          <code className={styles.codeInline}>/</code>.
        </p>
      </Section>

      <Section title="At-rest encryption">
        <AtRestEncryptionOverview view={settings.atRestEncryption} />
        <FieldEncryptionStatus view={settings.fieldEncryption} />
      </Section>

      <Section title="External connections">
        {connections.length === 0 ? (
          <p className={styles.textMuted}>No app-owned external connections are registered.</p>
        ) : (
          <ul className={styles.compactList}>
            {connections.map((conn) => (
              <li key={conn.id} className={styles.compactRow}>
                <span className={styles.compactRowLabel}>
                  <span className={styles.compactRowTitle}>
                    {conn.label} · {conn.provider}
                  </span>
                  <span className={styles.compactRowSubtitle}>
                    <code className={styles.codeInline}>{conn.pluginId}</code> · {conn.scope}
                    {conn.userId ? ` · ${conn.userId}` : ''} · updated{' '}
                    {new Date(conn.updatedAt * 1000).toLocaleString()}
                  </span>
                </span>
                <ConnectionStatusBadge status={conn.status} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="External provider configuration">
        <ProviderConfigsSection providers={providerConfigs} />
      </Section>

      <Section title="Email delivery (SMTP)">
        <SmtpSettingsForm smtp={settings.smtp} canEdit={canConfigureSecrets} />
      </Section>

      <Section title="Email templates">
        <p className={styles.lede}>
          Override the subject and body copy for transactional email, per locale. Branding (sender
          name, logo) is set on the <Link href="/console/identity">Identity</Link> page.
        </p>
        <EmailTemplatesForm />
      </Section>

      <Section title="Native mobile push relay">
        <PushRelaySettingsForm pushRelay={settings.pushRelay} />
      </Section>

      <Section title="Data retention">
        <RetentionSettingsForm retention={settings.retention} />
      </Section>
    </div>
  );
}

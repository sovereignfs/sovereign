'use client';

import { useState } from 'react';
import { Badge, Button, FormField, Select } from '@sovereignfs/ui';
import {
  activatePluginAction,
  setPluginAccessPolicyAction,
  type PluginAccessPolicyValue,
  type PluginCatalogEntry,
} from './actions';
import styles from '../console.module.css';

const POLICY_OPTIONS: { value: PluginAccessPolicyValue; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'admins', label: 'Admins and owners' },
  { value: 'selected_users', label: 'Selected users' },
  { value: 'selected_groups', label: 'Selected groups' },
  { value: 'disabled', label: 'Disabled' },
];

function ActivatedPolicyPrompt({ pluginId, pluginName }: { pluginId: string; pluginName: string }) {
  const [policy, setPolicy] = useState<PluginAccessPolicyValue>('disabled');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(nextPolicy: PluginAccessPolicyValue) {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set('pluginId', pluginId);
      fd.set('accessPolicy', nextPolicy);
      fd.set('selfService', 'false');
      await setPluginAccessPolicyAction(fd);
      setPolicy(nextPolicy);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className={styles.card} style={{ padding: 'var(--sv-space-3)' }}>
      <p>
        <strong>{pluginName}</strong> is now active but disabled — nobody can open it yet.
      </p>
      <FormField label="Who can open this plugin" id={`catalog-activated-policy-${pluginId}`}>
        {() => (
          <Select
            size="sm"
            value={policy}
            disabled={saving}
            onChange={(e) => save(e.target.value as PluginAccessPolicyValue)}
          >
            {POLICY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      {saved && (
        <p className={styles.textMuted}>
          Saved. Use the Access dialog below for user/group grants and self-service.
        </p>
      )}
    </li>
  );
}

function InactiveRow({
  entry,
  onActivated,
}: {
  entry: PluginCatalogEntry;
  onActivated: (pluginId: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Call the server action directly (not via useActionState/<form action>) so
  // this handler drives its own promise resolution: the moment
  // activatePluginAction resolves, we synchronously tell the parent to mark
  // this plugin "just activated" before React has a chance to apply the
  // revalidatePath()-refreshed catalog prop (which flips entry.active to
  // true) in a render where this row's own local state update lost the
  // race and never got to fire.
  async function handleActivate() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set('pluginId', entry.id);
    const result = await activatePluginAction(null, fd);
    setPending(false);
    if (result.success) {
      onActivated(entry.id);
    } else {
      setError(result.error);
    }
  }

  return (
    <li
      className={styles.card}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--sv-space-3)',
      }}
    >
      <span>
        {entry.name}
        {entry.description && <span className={styles.textMuted}> — {entry.description}</span>}
      </span>
      <div>
        <Button type="button" size="sm" disabled={pending} onClick={handleActivate}>
          {pending ? 'Activating…' : 'Activate'}
        </Button>
        {error && <p className={styles.errorText}>{error}</p>}
      </div>
    </li>
  );
}

function ActiveRow({ entry }: { entry: PluginCatalogEntry }) {
  return (
    <li
      className={styles.card}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--sv-space-3)',
      }}
    >
      <span>
        {entry.name} <span className={styles.textMuted}>({entry.id})</span>
      </span>
      <Badge variant="role">Active</Badge>
    </li>
  );
}

export function PluginCatalogSection({ catalog }: { catalog: PluginCatalogEntry[] }) {
  // Tracked separately from `entry.active` so the policy prompt survives the
  // revalidatePath()-driven prop update that flips `entry.active` to true —
  // relying on that prop directly would replace the prompt with the terminal
  // "Active" badge before the admin has picked a policy.
  const [justActivated, setJustActivated] = useState<ReadonlySet<string>>(new Set());

  if (catalog.length === 0) return null;

  const inactive = catalog.filter((e) => !e.active && !justActivated.has(e.id));
  const activated = catalog.filter((e) => justActivated.has(e.id));
  const active = catalog.filter((e) => e.active && !justActivated.has(e.id));

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Plugin catalog</h2>
      <p className={styles.help}>
        Every plugin bundled in this image (from <code>sovereign.plugins.json</code>). Activating
        one creates it on this instance immediately — no rebuild or redeploy required.
      </p>
      <ul className={styles.cards} style={{ gridTemplateColumns: '1fr', gap: 'var(--sv-space-2)' }}>
        {inactive.map((entry) => (
          <InactiveRow
            key={entry.id}
            entry={entry}
            onActivated={(id) => setJustActivated((prev) => new Set(prev).add(id))}
          />
        ))}
        {activated.map((entry) => (
          <ActivatedPolicyPrompt key={entry.id} pluginId={entry.id} pluginName={entry.name} />
        ))}
        {active.map((entry) => (
          <ActiveRow key={entry.id} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, FormField, Icon, Menu, Select, type MenuEntry } from '@sovereignfs/ui';
import {
  activatePluginAction,
  setPluginAccessPolicyAction,
  togglePluginAction,
  type PluginAccessPolicyValue,
} from './actions';
import { PluginAccessDialog } from './PluginAccessDialog';
import { RemovePluginButton } from './PluginInstallPanel';
import styles from '../console.module.css';

export type PluginStatus = 'incompatible' | 'inactive' | 'enabled' | 'disabled';

export interface PluginRow {
  id: string;
  name: string;
  version: string;
  description: string | null;
  type: string;
  routePrefix: string;
  adminOnly: boolean;
  example: boolean;
  compatibilityError: string | null;
  compatibilityWarnings: string[];
  status: PluginStatus;
  /** Chrome plugins (Account/Console/Launcher) never show Access — access policy is a permanent no-op for them. */
  isChrome: boolean;
  openableByViewer: boolean;
}

const STATUS_FILTERS: { value: 'all' | PluginStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'incompatible', label: 'Incompatible' },
];

const POLICY_OPTIONS: { value: PluginAccessPolicyValue; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'admins', label: 'Admins and owners' },
  { value: 'selected_users', label: 'Selected users' },
  { value: 'selected_groups', label: 'Selected groups' },
  { value: 'disabled', label: 'Disabled' },
];

function StatusBadge({ status }: { status: PluginStatus }) {
  if (status === 'incompatible') {
    return (
      <Badge variant="status" status="failed">
        Incompatible
      </Badge>
    );
  }
  if (status === 'inactive') {
    return (
      <Badge variant="status" status="neutral">
        Inactive
      </Badge>
    );
  }
  if (status === 'enabled') return <Badge variant="role">Enabled</Badge>;
  return (
    <Badge variant="status" status="deactivated">
      Disabled
    </Badge>
  );
}

/** Shown in place of a row/card's normal actions right after activation, until the admin picks an initial policy or dismisses. */
function ActivatedPolicyPrompt({
  pluginId,
  pluginName,
  onDone,
}: {
  pluginId: string;
  pluginName: string;
  onDone: () => void;
}) {
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
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sv-space-2)', minWidth: 220 }}
    >
      <p className={styles.textMuted}>
        <strong>{pluginName}</strong> is now active but disabled — nobody can open it yet.
      </p>
      <FormField label="Who can open this plugin" id={`activated-policy-${pluginId}`}>
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
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>
          Done
        </Button>
      )}
    </div>
  );
}

interface RowProps {
  row: PluginRow;
  justActivated: boolean;
  onActivated: () => void;
  onDismissActivated: () => void;
}

function useActivate(row: PluginRow, onActivated: () => void) {
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleActivate() {
    setActivating(true);
    setError(null);
    const fd = new FormData();
    fd.set('pluginId', row.id);
    const result = await activatePluginAction(null, fd);
    setActivating(false);
    if (result.success) onActivated();
    else setError(result.error);
  }

  return { activating, error, handleActivate };
}

function DesktopRow({ row, justActivated, onActivated, onDismissActivated }: RowProps) {
  const isPlatformType = row.type === 'platform';
  const { activating, error, handleActivate } = useActivate(row, onActivated);

  return (
    <tr className={styles.tr}>
      <td className={styles.td}>
        <div className={styles.userCell}>
          <span className={styles.userName}>{row.name}</span>
          {row.description && <span className={styles.userEmail}>{row.description}</span>}
          <span className={styles.userId}>{row.id}</span>
        </div>
      </td>

      <td className={styles.td}>
        <code className={styles.codeInline}>{row.version}</code>
      </td>

      <td className={styles.td}>
        <div className={styles.typeBadges}>
          <Badge variant="mono">{row.type}</Badge>
          {row.adminOnly && <Badge variant="mono">admin-only</Badge>}
          {row.example && <Badge variant="mono">example</Badge>}
        </div>
      </td>

      <td className={styles.td}>
        <code className={styles.codeInline}>{row.routePrefix}</code>
      </td>

      <td className={styles.td}>
        <StatusBadge status={row.status} />
        {row.compatibilityWarnings.length > 0 && (
          <span className={styles.adminOnlyNote} title={row.compatibilityWarnings.join('\n')}>
            {' '}
            ⚠ version advisory
          </span>
        )}
      </td>

      <td className={styles.td}>
        {row.status === 'incompatible' ? (
          <span className={styles.adminOnlyNote} title={row.compatibilityError ?? undefined}>
            Incompatible
          </span>
        ) : justActivated ? (
          <ActivatedPolicyPrompt
            pluginId={row.id}
            pluginName={row.name}
            onDone={onDismissActivated}
          />
        ) : row.status === 'inactive' ? (
          <div className={styles.rowActions}>
            <Button type="button" size="sm" disabled={activating} onClick={handleActivate}>
              {activating ? 'Activating…' : 'Activate'}
            </Button>
            {!isPlatformType && <RemovePluginButton pluginId={row.id} pluginName={row.name} />}
            {error && <p className={styles.errorText}>{error}</p>}
          </div>
        ) : (
          <div className={styles.rowActions}>
            <form action={togglePluginAction} style={{ display: 'inline-flex' }}>
              <input type="hidden" name="pluginId" value={row.id} />
              <input
                type="hidden"
                name="enabled"
                value={row.status === 'enabled' ? 'false' : 'true'}
              />
              <button
                type="submit"
                className={row.status === 'enabled' ? styles.iconBtn : styles.iconBtnReactivate}
                title={row.status === 'enabled' ? 'Disable plugin' : 'Enable plugin'}
              >
                {row.status === 'enabled' ? (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                ) : (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            </form>

            {!row.isChrome && <PluginAccessDialog pluginId={row.id} pluginName={row.name} />}

            {row.openableByViewer ? (
              <a href={row.routePrefix} className={styles.iconBtnReactivate} title="Open">
                Open
              </a>
            ) : (
              <span
                className={styles.adminOnlyNote}
                title="You are not currently allowed to open this plugin under its access policy."
              >
                Open (restricted)
              </span>
            )}

            {!isPlatformType && <RemovePluginButton pluginId={row.id} pluginName={row.name} />}
          </div>
        )}
      </td>
    </tr>
  );
}

function MobileCard({ row, justActivated, onActivated, onDismissActivated }: RowProps) {
  const isPlatformType = row.type === 'platform';
  const { activating, error, handleActivate } = useActivate(row, onActivated);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const menuItems: MenuEntry[] = [
    ...(!row.isChrome ? [{ label: 'Access', onSelect: () => setAccessOpen(true) }] : []),
    ...(!isPlatformType
      ? [
          ...(!row.isChrome ? [{ type: 'separator' as const }] : []),
          { label: 'Remove', destructive: true, onSelect: () => setRemoveOpen(true) },
        ]
      : []),
  ];

  return (
    <div className={styles.pluginCard}>
      <div className={styles.pluginCardHeader}>
        <div className={styles.pluginCardInfo}>
          <span className={styles.pluginCardName}>{row.name}</span>
          {row.description && <span className={styles.pluginCardDesc}>{row.description}</span>}
          <span className={styles.pluginCardId}>{row.id}</span>
        </div>
        <div className={styles.pluginCardStatus}>
          <StatusBadge status={row.status} />
        </div>
      </div>

      <div className={styles.pluginCardMeta}>
        <code className={styles.pluginCardMetaCode}>{row.version}</code>
        <Badge variant="mono">{row.type}</Badge>
        {row.adminOnly && <Badge variant="mono">admin-only</Badge>}
        {row.example && <Badge variant="mono">example</Badge>}
        <code className={styles.pluginCardMetaCode}>{row.routePrefix}</code>
      </div>

      {row.compatibilityWarnings.length > 0 && (
        <p className={styles.pluginCardWarning}>⚠ {row.compatibilityWarnings.join(' · ')}</p>
      )}

      {row.status === 'incompatible' ? null : justActivated ? (
        <ActivatedPolicyPrompt
          pluginId={row.id}
          pluginName={row.name}
          onDone={onDismissActivated}
        />
      ) : row.status === 'inactive' ? (
        <div className={styles.pluginCardActions}>
          <Button type="button" size="sm" disabled={activating} onClick={handleActivate}>
            {activating ? 'Activating…' : 'Activate'}
          </Button>
          {!isPlatformType && (
            <RemovePluginButton
              pluginId={row.id}
              pluginName={row.name}
              className={styles.pluginCardBtnRemove}
              label="Remove"
            />
          )}
          {error && <p className={styles.errorText}>{error}</p>}
        </div>
      ) : (
        <div className={styles.pluginCardActions}>
          <form action={togglePluginAction}>
            <input type="hidden" name="pluginId" value={row.id} />
            <input
              type="hidden"
              name="enabled"
              value={row.status === 'enabled' ? 'false' : 'true'}
            />
            <button type="submit" className={styles.pluginCardBtnToggle}>
              {row.status === 'enabled' ? 'Disable' : 'Enable'}
            </button>
          </form>

          {row.openableByViewer ? (
            <a href={row.routePrefix} className={styles.pluginCardBtnToggle}>
              Open
            </a>
          ) : (
            <span
              className={styles.pluginCardBtnToggle}
              style={{ opacity: 0.5, cursor: 'not-allowed' }}
              title="You are not currently allowed to open this plugin under its access policy."
            >
              Open
            </span>
          )}

          {menuItems.length > 0 && (
            <Menu
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              aria-label={`Actions for ${row.name}`}
              align="right"
              items={menuItems}
              trigger={
                <button
                  type="button"
                  className={styles.userCardMenuBtn}
                  aria-label={`Actions for ${row.name}`}
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  <Icon name="ellipsis-vertical" size="sm" aria-hidden />
                </button>
              }
            />
          )}

          {!row.isChrome && (
            <PluginAccessDialog
              pluginId={row.id}
              pluginName={row.name}
              open={accessOpen}
              onOpenChange={setAccessOpen}
            />
          )}
          {!isPlatformType && (
            <RemovePluginButton
              pluginId={row.id}
              pluginName={row.name}
              open={removeOpen}
              onOpenChange={setRemoveOpen}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FilterBar({
  query,
  onQuery,
  status,
  onStatus,
  showExamples,
  onShowExamples,
  total,
  shown,
}: {
  query: string;
  onQuery: (v: string) => void;
  status: 'all' | PluginStatus;
  onStatus: (v: 'all' | PluginStatus) => void;
  showExamples: boolean;
  onShowExamples: (v: boolean) => void;
  total: number;
  shown: number;
}) {
  return (
    <div className={styles.pluginFilterBar}>
      <div className={styles.activitySearchBar}>
        <Icon name="search" size="sm" aria-hidden />
        <input
          type="search"
          placeholder="Search plugins…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          className={styles.activitySearchInput}
          aria-label="Search plugins"
        />
        <span className={styles.activitySearchCount}>
          {shown} of {total}
        </span>
      </div>

      <div className={styles.pluginStatusPills}>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={status === f.value ? styles.pluginStatusPillActive : styles.pluginStatusPill}
            onClick={() => onStatus(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <label className={styles.pluginExampleToggle}>
        <input
          type="checkbox"
          checked={showExamples}
          onChange={(e) => onShowExamples(e.target.checked)}
        />
        <span>Show examples</span>
      </label>
    </div>
  );
}

export function PluginsTable({ rows }: { rows: PluginRow[] }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PluginStatus>('all');
  const [showExamples, setShowExamples] = useState(true);
  // Tracked separately from the row's own `status` so the just-activated
  // policy prompt survives the revalidatePath()-driven prop refresh that
  // flips an inactive row to `enabled` before the admin has picked a policy
  // — see the identical pattern (and the race it fixes) in Task 13.8.
  const [justActivated, setJustActivated] = useState<ReadonlySet<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      // A just-activated row stays visible regardless of the status filter —
      // its real status has already flipped away from `inactive` server-side,
      // but the admin still needs to see the policy prompt to complete the
      // flow they started (e.g. under the "Inactive" filter, activating a
      // plugin would otherwise make it vanish from view mid-task).
      if (justActivated.has(r.id)) return true;
      if (!showExamples && r.example) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (
        q &&
        !(
          r.name.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          (r.description ?? '').toLowerCase().includes(q)
        )
      ) {
        return false;
      }
      return true;
    });
  }, [rows, query, statusFilter, showExamples, justActivated]);

  function markActivated(id: string) {
    setJustActivated((prev) => new Set(prev).add(id));
  }

  function dismissActivated(id: string) {
    setJustActivated((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Plugins</h2>

      <FilterBar
        query={query}
        onQuery={setQuery}
        status={statusFilter}
        onStatus={setStatusFilter}
        showExamples={showExamples}
        onShowExamples={setShowExamples}
        total={rows.length}
        shown={filtered.length}
      />

      {filtered.length === 0 ? (
        <p className={styles.textMuted}>No plugins match your filters.</p>
      ) : (
        <>
          <div className={styles.tableCard}>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Plugin</th>
                    <th className={styles.th}>Version</th>
                    <th className={styles.th}>Type</th>
                    <th className={styles.th}>Route</th>
                    <th className={styles.th}>Status</th>
                    <th className={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <DesktopRow
                      key={row.id}
                      row={row}
                      justActivated={justActivated.has(row.id)}
                      onActivated={() => markActivated(row.id)}
                      onDismissActivated={() => dismissActivated(row.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.pluginCardList}>
            {filtered.map((row) => (
              <MobileCard
                key={row.id}
                row={row}
                justActivated={justActivated.has(row.id)}
                onActivated={() => markActivated(row.id)}
                onDismissActivated={() => dismissActivated(row.id)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

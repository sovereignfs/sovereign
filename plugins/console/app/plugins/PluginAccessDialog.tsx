'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import { Button, Dialog, FormField, Input, Select } from '@sovereignfs/ui';
import type { DirectoryUser } from '@sovereignfs/sdk';
import {
  getPluginAccessState,
  grantPluginAccessGroupAction,
  grantPluginAccessUserAction,
  listGroupOptions,
  listResolvedPluginAccessGroups,
  listResolvedPluginAccessUsers,
  revokePluginAccessGroupAction,
  revokePluginAccessUserAction,
  searchPluginAccessDirectoryUsers,
  setPluginAccessPolicyAction,
  type GroupOption,
  type PluginAccessActionState,
  type PluginAccessPolicyValue,
  type ResolvedPluginAccessGroup,
  type ResolvedPluginAccessUser,
} from './actions';
import styles from '../console.module.css';

const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

const POLICY_OPTIONS: { value: PluginAccessPolicyValue; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'admins', label: 'Admins and owners' },
  { value: 'selected_users', label: 'Selected users' },
  { value: 'selected_groups', label: 'Selected groups' },
  { value: 'disabled', label: 'Disabled' },
];

function UserPicker({ pluginId, onChanged }: { pluginId: string; onChanged: () => void }) {
  const [state, formAction, pending] = useActionState<PluginAccessActionState | null, FormData>(
    grantPluginAccessUserAction,
    null,
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [selected, setSelected] = useState<DirectoryUser | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (selected || query.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchPluginAccessDirectoryUsers(query.trim())
        .then((users) => {
          if (!cancelled) setResults(users);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, selected]);

  useEffect(() => {
    if (state?.success) {
      setSelected(null);
      setQuery('');
      setResults([]);
      formRef.current?.reset();
      onChanged();
    }
  }, [state, onChanged]);

  return (
    <form ref={formRef} action={formAction} className={styles.inviteForm}>
      <input type="hidden" name="pluginId" value={pluginId} />
      <input type="hidden" name="userId" value={selected?.id ?? ''} />
      <FormField
        label="Grant a user"
        id={`plugin-access-user-${pluginId}`}
        hint="Search by name or email"
      >
        {(field) => (
          <div style={{ position: 'relative' }}>
            <Input
              {...field}
              value={selected ? (selected.name ?? selected.email) : query}
              onChange={(event) => {
                setSelected(null);
                setQuery(event.currentTarget.value);
              }}
              placeholder="Search by name or email"
              autoComplete="off"
            />
            {results.length > 0 && !selected ? (
              <ul className={styles.cards} style={{ gridTemplateColumns: '1fr', marginTop: 4 }}>
                {results.map((user) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      className={styles.card}
                      style={{ padding: 'var(--sv-space-2) var(--sv-space-3)', cursor: 'pointer' }}
                      onClick={() => {
                        setSelected(user);
                        setResults([]);
                      }}
                    >
                      {user.name ?? user.email}
                      {user.name ? ` (${user.email})` : ''}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </FormField>
      {state && !state.success && <p className={styles.errorText}>{state.error}</p>}
      <Button type="submit" size="sm" disabled={!selected || pending}>
        {pending ? 'Granting…' : 'Grant access'}
      </Button>
    </form>
  );
}

function UserGrantList({
  pluginId,
  users,
  onChanged,
}: {
  pluginId: string;
  users: ResolvedPluginAccessUser[];
  onChanged: () => void;
}) {
  if (users.length === 0) {
    return <p className={styles.textMuted}>No users granted yet.</p>;
  }
  return (
    <ul className={styles.cards} style={{ gridTemplateColumns: '1fr', gap: 'var(--sv-space-2)' }}>
      {users.map((user) => (
        <li
          key={user.userId}
          className={styles.card}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--sv-space-3)',
          }}
        >
          <span>
            {user.name ?? user.email}
            {user.name && <span className={styles.textMuted}> ({user.email})</span>}
          </span>
          <form
            action={async (formData) => {
              await revokePluginAccessUserAction(formData);
              onChanged();
            }}
          >
            <input type="hidden" name="pluginId" value={pluginId} />
            <input type="hidden" name="userId" value={user.userId} />
            <button type="submit" className={styles.iconBtnDanger} title="Revoke">
              Revoke
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

function GroupPicker({
  pluginId,
  groupOptions,
  onChanged,
}: {
  pluginId: string;
  groupOptions: GroupOption[];
  onChanged: () => void;
}) {
  const [state, formAction, pending] = useActionState<PluginAccessActionState | null, FormData>(
    grantPluginAccessGroupAction,
    null,
  );
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      setSelectedGroupId('');
      formRef.current?.reset();
      onChanged();
    }
  }, [state, onChanged]);

  if (groupOptions.length === 0) {
    return (
      <p className={styles.textMuted}>
        No groups exist yet — create one from Console → Groups first.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className={styles.inviteForm}>
      <input type="hidden" name="pluginId" value={pluginId} />
      <input type="hidden" name="groupId" value={selectedGroupId} />
      <FormField label="Grant a group" id={`plugin-access-group-${pluginId}`}>
        {() => (
          <Select
            size="sm"
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
          >
            <option value="">Choose a group…</option>
            {groupOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      {state && !state.success && <p className={styles.errorText}>{state.error}</p>}
      <Button type="submit" size="sm" disabled={!selectedGroupId || pending}>
        {pending ? 'Granting…' : 'Grant access'}
      </Button>
    </form>
  );
}

function GroupGrantList({
  pluginId,
  groups,
  onChanged,
}: {
  pluginId: string;
  groups: ResolvedPluginAccessGroup[];
  onChanged: () => void;
}) {
  if (groups.length === 0) {
    return <p className={styles.textMuted}>No groups granted yet.</p>;
  }
  return (
    <ul className={styles.cards} style={{ gridTemplateColumns: '1fr', gap: 'var(--sv-space-2)' }}>
      {groups.map((group) => (
        <li
          key={group.groupId}
          className={styles.card}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--sv-space-3)',
          }}
        >
          <span>{group.name}</span>
          <form
            action={async (formData) => {
              await revokePluginAccessGroupAction(formData);
              onChanged();
            }}
          >
            <input type="hidden" name="pluginId" value={pluginId} />
            <input type="hidden" name="groupId" value={group.groupId} />
            <button type="submit" className={styles.iconBtnDanger} title="Revoke">
              Revoke
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

export function PluginAccessDialog({
  pluginId,
  pluginName,
  open: controlledOpen,
  onOpenChange,
}: {
  pluginId: string;
  pluginName: string;
  /**
   * External control (e.g. a kebab `Menu` item on mobile plugin cards) —
   * when provided, this component renders only the `Dialog`, not its own
   * "Access" trigger button. Omit both for the default self-contained
   * behavior (own button + own open state).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setUncontrolledOpen;
  const [policy, setPolicy] = useState<PluginAccessPolicyValue>('everyone');
  const [selfService, setSelfService] = useState(false);
  const [users, setUsers] = useState<ResolvedPluginAccessUser[] | null>(null);
  const [groups, setGroups] = useState<ResolvedPluginAccessGroup[] | null>(null);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    getPluginAccessState(pluginId).then((state) => {
      setPolicy(state.accessPolicy);
      setSelfService(state.selfService);
    });
    listResolvedPluginAccessUsers(pluginId)
      .then(setUsers)
      .catch(() => setUsers([]));
    listResolvedPluginAccessGroups(pluginId)
      .then(setGroups)
      .catch(() => setGroups([]));
    listGroupOptions()
      .then(setGroupOptions)
      .catch(() => setGroupOptions([]));
  }, [pluginId]);

  useEffect(() => {
    if (!open) {
      setUsers(null);
      setGroups(null);
      return;
    }
    refresh();
  }, [open, refresh]);

  async function savePolicy(nextPolicy: PluginAccessPolicyValue, nextSelfService: boolean) {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set('pluginId', pluginId);
      fd.set('accessPolicy', nextPolicy);
      fd.set('selfService', String(nextSelfService));
      await setPluginAccessPolicyAction(fd);
      setPolicy(nextPolicy);
      setSelfService(nextSelfService);
    } finally {
      setSaving(false);
    }
  }

  const showUserPicker = policy === 'selected_users';
  const showGroupPicker = policy === 'selected_groups';
  const showSelfService = showUserPicker || showGroupPicker;
  const emptyGrantWarning =
    (showUserPicker && users?.length === 0) || (showGroupPicker && groups?.length === 0);

  return (
    <>
      {!isControlled && (
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Access
        </Button>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        // Dialog panels are a fixed box regardless of content (by design —
        // see Dialog.module.css), so "md" left most policies looking like a
        // near-empty skeleton (just a policy select). "sm" fits the common
        // case; the richer selected_users/selected_groups content scrolls
        // internally rather than clipping, which Dialog already supports.
        size="sm"
        title={`Access for "${pluginName}"`}
      >
        <div className={styles.settingsSections}>
          <section className={styles.settingsSection}>
            <h3 className={styles.sectionTitle}>Policy</h3>
            <p className={styles.help}>
              Managing a plugin here does not automatically grant you app access — Console
              management and plugin app access are separate.
            </p>
            <FormField label="Who can open this plugin" id={`plugin-access-policy-${pluginId}`}>
              {() => (
                <Select
                  size="sm"
                  value={policy}
                  disabled={saving}
                  onChange={(e) =>
                    savePolicy(e.target.value as PluginAccessPolicyValue, selfService)
                  }
                >
                  {POLICY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            {policy === 'disabled' && (
              <p className={styles.help}>
                Disabled is the strongest state — no one can open this plugin, even admins/owners or
                a user/group already granted access. It remains installed and manageable.
              </p>
            )}
            {showSelfService && (
              <FormField label="" id={`plugin-access-self-service-${pluginId}`}>
                {() => (
                  <label
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--sv-space-2)' }}
                  >
                    <input
                      type="checkbox"
                      checked={selfService}
                      disabled={saving}
                      onChange={(e) => savePolicy(policy, e.target.checked)}
                    />
                    <span>
                      Allow eligible users to self-service enable/disable this plugin (requires the{' '}
                      <code>plugins:self-manage</code> capability)
                    </span>
                  </label>
                )}
              </FormField>
            )}
            {emptyGrantWarning && (
              <p className={styles.errorText}>
                No {showUserPicker ? 'users' : 'groups'} are granted yet — nobody can open this
                plugin until you grant at least one.
              </p>
            )}
          </section>

          {showUserPicker && (
            <section className={styles.settingsSection}>
              <h3 className={styles.sectionTitle}>Selected users</h3>
              {users === null ? (
                <p className={styles.textMuted}>Loading…</p>
              ) : (
                <UserGrantList pluginId={pluginId} users={users} onChanged={refresh} />
              )}
              <UserPicker pluginId={pluginId} onChanged={refresh} />
            </section>
          )}

          {showGroupPicker && (
            <section className={styles.settingsSection}>
              <h3 className={styles.sectionTitle}>Selected groups</h3>
              {groups === null ? (
                <p className={styles.textMuted}>Loading…</p>
              ) : (
                <GroupGrantList pluginId={pluginId} groups={groups} onChanged={refresh} />
              )}
              <GroupPicker pluginId={pluginId} groupOptions={groupOptions} onChanged={refresh} />
            </section>
          )}
        </div>
      </Dialog>
    </>
  );
}

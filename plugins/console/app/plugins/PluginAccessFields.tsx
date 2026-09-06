'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import { Button, Checkbox, FormField, Input, Select, useToast } from '@sovereignfs/ui';
import type { DirectoryUser } from '@sovereignfs/sdk';
import { DetailSection } from '../_components/DetailPaneHeader';
import type { ActionResult } from '../_lib/action-result';
import { useActionRunner } from '../_lib/use-action';
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

/**
 * Plain-language descriptions for `packages/manifest/src/schema.ts`'s
 * `permissionSchema` values — shown here so an admin can see what an app can
 * actually do, not just who's allowed to open it. A permission with no
 * matching label (a value added to the schema but not listed here) falls
 * back to its raw string rather than being silently dropped.
 */
const PERMISSION_LABELS: Record<string, string> = {
  'auth:session': "Read the signed-in user's session (who's logged in)",
  'db:readWrite': "Read and write this app's own data",
  'db:readOnly': "Read this app's own data (no changes)",
  'mailer:send': "Send email to the signed-in user on the instance's behalf",
  'mailer:sendExternal': 'Send email to any address, including outside this instance',
  'storage:readWrite': 'Store and retrieve files',
  'notifications:send': 'Send in-app notifications',
  'jobs:write': 'Run background jobs',
  'events:publish': 'Publish real-time events other apps can subscribe to',
  'events:subscribe': 'Subscribe to real-time events from other apps',
  'data:provide': "Expose its own data for other apps to read (with the user's consent)",
  'data:consume': "Read another app's data (with the user's consent)",
  'data:export': "Include its data in a user's account data export",
  'data:import': "Restore its data from a user's account data import",
  'activity:write': 'Record entries in the activity log',
  'e2ee:use': 'Use end-to-end encrypted storage',
  'crypto:use': 'Use cryptographic primitives (e.g. hashing, signing)',
  'admin:*': 'Full administrative access to the instance',
  'device:haptics': "Trigger haptic feedback on a user's device",
  'device:notifications': "Send native push notifications to a user's device",
  'device:biometrics': "Use Face ID/Touch ID or a user's device biometrics",
  'device:secureStorage': "Store data in a user's device secure storage",
  'handoffs:send': 'Hand off a task to another app',
  'handoffs:receive': 'Receive a handed-off task from another app',
  'tools:provide': 'Expose actions a trusted caller (e.g. an assistant) can invoke',
  'tools:call': 'Invoke actions exposed by other apps',
};

function permissionLabel(permission: string): string {
  return PERMISSION_LABELS[permission] ?? permission;
}

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
          <div>
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
              <ul className={[styles.compactList, styles.compactListBelowInput].join(' ')}>
                {results.map((user) => (
                  <li key={user.id} className={styles.compactRow}>
                    <button
                      type="button"
                      className={styles.compactRowButton}
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
      {state && !state.success && (
        <p className={styles.errorText} role="status">
          {state.error}
        </p>
      )}
      <Button type="submit" size="sm" disabled={!selected || pending}>
        {pending ? 'Granting…' : 'Grant access'}
      </Button>
    </form>
  );
}

/** One granted user/group row with its Revoke — errors toast, success refreshes the list. */
function GrantRow({
  title,
  subtitle,
  revoke,
  onChanged,
}: {
  title: string;
  subtitle?: string;
  revoke: () => Promise<ActionResult>;
  onChanged: () => void;
}) {
  const [run, pending] = useActionRunner();
  return (
    <li className={styles.compactRow}>
      <span className={styles.compactRowLabel}>
        <span className={styles.compactRowTitle}>{title}</span>
        {subtitle && <span className={styles.compactRowSubtitle}>{subtitle}</span>}
      </span>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() => {
          void run(revoke).then((result) => {
            if (result.ok) onChanged();
          });
        }}
      >
        {pending ? 'Revoking…' : 'Revoke'}
      </Button>
    </li>
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
    <ul className={styles.compactList}>
      {users.map((user) => (
        <GrantRow
          key={user.userId}
          title={user.name ?? user.email}
          subtitle={user.name ? user.email : undefined}
          onChanged={onChanged}
          revoke={() => {
            const fd = new FormData();
            fd.set('pluginId', pluginId);
            fd.set('userId', user.userId);
            return revokePluginAccessUserAction(fd);
          }}
        />
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
      {state && !state.success && (
        <p className={styles.errorText} role="status">
          {state.error}
        </p>
      )}
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
    <ul className={styles.compactList}>
      {groups.map((group) => (
        <GrantRow
          key={group.groupId}
          title={group.name}
          onChanged={onChanged}
          revoke={() => {
            const fd = new FormData();
            fd.set('pluginId', pluginId);
            fd.set('groupId', group.groupId);
            return revokePluginAccessGroupAction(fd);
          }}
        />
      ))}
    </ul>
  );
}

/**
 * The actual access-management fields — permissions list, policy select,
 * selected users/groups grant lists — extracted from the former
 * `PluginAccessDialog` so it can render inline in the desktop detail pane
 * (`PluginDetailPane`) without a dialog wrapper, while `PluginAccessDialog`
 * itself keeps composing this same content behind a button+`Dialog` for
 * mobile, which has no detail column to render into. Mirrors workstream 0022
 * leg 2/3's `UserCapabilitiesFields`/`GroupDetailFields` split.
 */
export function PluginAccessFields({
  pluginId,
  permissions = [],
}: {
  pluginId: string;
  /** The app's manifest-declared `permissions` array (GDPR-5) — shown read-only, not editable here. */
  permissions?: string[];
}) {
  const [policy, setPolicy] = useState<PluginAccessPolicyValue>('everyone');
  const [selfService, setSelfService] = useState(false);
  const [users, setUsers] = useState<ResolvedPluginAccessUser[] | null>(null);
  const [groups, setGroups] = useState<ResolvedPluginAccessGroup[] | null>(null);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

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
    refresh();
  }, [refresh]);

  async function savePolicy(nextPolicy: PluginAccessPolicyValue, nextSelfService: boolean) {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set('pluginId', pluginId);
      fd.set('accessPolicy', nextPolicy);
      fd.set('selfService', String(nextSelfService));
      const result = await setPluginAccessPolicyAction(fd);
      if (result.ok) {
        setPolicy(nextPolicy);
        setSelfService(nextSelfService);
        toast.show({ title: 'Access policy saved', category: 'success' });
      } else {
        // The select/checkbox stay on the previous (still-saved) value.
        toast.show({
          title: 'Could not save access policy',
          message: result.error,
          category: 'error',
        });
      }
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
    <div className={styles.detailFieldsStack}>
      <DetailSection title="Permissions">
        {permissions.length === 0 ? (
          <p className={styles.textMuted}>This app declares no special permissions.</p>
        ) : (
          <ul className={styles.compactList}>
            {permissions.map((permission) => (
              <li key={permission} className={styles.compactRow}>
                <span className={styles.compactRowSubtitle}>{permissionLabel(permission)}</span>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>

      <DetailSection
        title="Policy"
        description="Managing an app here does not automatically grant you app access — Console management and app access are separate."
      >
        <FormField label="Who can open this app" id={`plugin-access-policy-${pluginId}`}>
          {() => (
            <Select
              size="sm"
              value={policy}
              disabled={saving}
              onChange={(e) => savePolicy(e.target.value as PluginAccessPolicyValue, selfService)}
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
          <p className={styles.helpText}>
            Disabled is the strongest state — no one can open this app, even admins/owners or a
            user/group already granted access. It remains installed and manageable.
          </p>
        )}
        {showSelfService && (
          <Checkbox
            id={`plugin-access-self-service-${pluginId}`}
            label="Let eligible users turn this app on or off for themselves"
            checked={selfService}
            disabled={saving}
            onChange={(checked) => void savePolicy(policy, checked)}
          />
        )}
        {showSelfService && (
          <p className={styles.helpText}>
            Applies to users who hold the self-service capability (grant it from a user&apos;s
            detail pane under Users).
          </p>
        )}
        {emptyGrantWarning && (
          <p className={styles.errorText} role="status">
            No {showUserPicker ? 'users' : 'groups'} are granted yet — nobody can open this app
            until you grant at least one.
          </p>
        )}
      </DetailSection>

      {showUserPicker && (
        <DetailSection title="Selected users">
          {users === null ? (
            <p className={styles.textMuted}>Loading…</p>
          ) : (
            <UserGrantList pluginId={pluginId} users={users} onChanged={refresh} />
          )}
          <UserPicker pluginId={pluginId} onChanged={refresh} />
        </DetailSection>
      )}

      {showGroupPicker && (
        <DetailSection title="Selected groups">
          {groups === null ? (
            <p className={styles.textMuted}>Loading…</p>
          ) : (
            <GroupGrantList pluginId={pluginId} groups={groups} onChanged={refresh} />
          )}
          <GroupPicker pluginId={pluginId} groupOptions={groupOptions} onChanged={refresh} />
        </DetailSection>
      )}
    </div>
  );
}

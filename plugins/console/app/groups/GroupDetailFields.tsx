'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import { Button, FormField, Input } from '@sovereignfs/ui';
import type { DirectoryUser } from '@sovereignfs/sdk';
import {
  addGroupMemberAction,
  deleteGroupAction,
  listResolvedGroupMembers,
  removeGroupMemberAction,
  searchGroupDirectoryUsers,
  updateGroupAction,
  type GroupActionState,
  type ResolvedGroupMember,
} from './actions';
import styles from '../console.module.css';

const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

interface GroupSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

function MemberPicker({ groupId, onChanged }: { groupId: string; onChanged: () => void }) {
  const [state, formAction, pending] = useActionState<GroupActionState | null, FormData>(
    addGroupMemberAction,
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
      searchGroupDirectoryUsers(query.trim())
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
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="userId" value={selected?.id ?? ''} />
      <FormField label="Add a person" id="group-member-search" hint="Search by name or email">
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
        {pending ? 'Adding…' : 'Add to group'}
      </Button>
    </form>
  );
}

function MemberList({
  groupId,
  members,
  onChanged,
}: {
  groupId: string;
  members: ResolvedGroupMember[];
  onChanged: () => void;
}) {
  if (members.length === 0) {
    return <p className={styles.textMuted}>No members yet.</p>;
  }

  return (
    <ul className={styles.cards} style={{ gridTemplateColumns: '1fr', gap: 'var(--sv-space-2)' }}>
      {members.map((member) => (
        <li
          key={member.userId}
          className={styles.card}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--sv-space-3)',
          }}
        >
          <span>
            {member.name ?? member.email}
            {member.name && <span className={styles.textMuted}> ({member.email})</span>}
          </span>
          <form
            action={async (formData) => {
              await removeGroupMemberAction(formData);
              onChanged();
            }}
          >
            <input type="hidden" name="groupId" value={groupId} />
            <input type="hidden" name="userId" value={member.userId} />
            <button type="submit" className={styles.iconBtnDanger} title="Remove">
              Remove
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

/**
 * The actual group management fields — details form, members list/picker,
 * danger zone — extracted from the former `ManageGroupDialog` so it can
 * render inline in the desktop detail pane (`GroupDetailPane`) without a
 * dialog wrapper, while `ManageGroupDialog` itself keeps composing this same
 * content behind a button+`Dialog` for mobile, which has no detail column to
 * render into. Mirrors workstream 0022 leg 2's `UserCapabilitiesFields` split.
 */
export function GroupDetailFields({ group }: { group: GroupSummary }) {
  const [members, setMembers] = useState<ResolvedGroupMember[] | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const refreshMembers = useCallback(() => {
    listResolvedGroupMembers(group.id)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [group.id]);

  useEffect(() => {
    refreshMembers();
  }, [refreshMembers]);

  return (
    <div className={styles.settingsSections}>
      <section className={styles.settingsSection}>
        <h3 className={styles.sectionTitle}>Details</h3>
        <form action={updateGroupAction} className={styles.inviteForm}>
          <input type="hidden" name="id" value={group.id} />
          <FormField label="Name" id={`group-name-${group.id}`}>
            {(field) => <Input {...field} name="name" defaultValue={group.name} />}
          </FormField>
          <FormField label="Description" id={`group-description-${group.id}`}>
            {(field) => (
              <Input {...field} name="description" defaultValue={group.description ?? ''} />
            )}
          </FormField>
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      </section>

      <section className={styles.settingsSection}>
        <h3 className={styles.sectionTitle}>Members</h3>
        {members === null ? (
          <p className={styles.textMuted}>Loading…</p>
        ) : (
          <MemberList groupId={group.id} members={members} onChanged={refreshMembers} />
        )}
        <MemberPicker groupId={group.id} onChanged={refreshMembers} />
      </section>

      <section className={styles.settingsSection}>
        <h3 className={styles.sectionTitle}>Danger zone</h3>
        {!confirmingDelete ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete group
          </Button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sv-space-3)' }}>
            <p className={styles.errorText}>
              Deleting removes the group and its membership. This cannot be undone. If the group is
              used by an app access policy, deletion is blocked until you confirm again.
            </p>
            <div style={{ display: 'flex', gap: 'var(--sv-space-2)' }}>
              <form action={deleteGroupAction}>
                <input type="hidden" name="id" value={group.id} />
                <Button type="submit" variant="destructive" size="sm">
                  Confirm delete
                </Button>
              </form>
              <form action={deleteGroupAction}>
                <input type="hidden" name="id" value={group.id} />
                <input type="hidden" name="force" value="true" />
                <Button type="submit" variant="destructive" size="sm">
                  Delete anyway (force)
                </Button>
              </form>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

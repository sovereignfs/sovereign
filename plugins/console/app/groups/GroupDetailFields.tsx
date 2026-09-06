'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import { Avatar, Button, ConfirmDialog, FormField, Input, useToast } from '@sovereignfs/ui';
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
import { ActionFeedback } from '../_components/ActionFeedback';
import { DetailSection } from '../_components/DetailPaneHeader';
import type { ActionResult } from '../_lib/action-result';
import { useActionRunner } from '../_lib/use-action';
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
    <form
      ref={formRef}
      action={formAction}
      className={[styles.inviteForm, styles.inviteFormCompact].join(' ')}
    >
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="userId" value={selected?.id ?? ''} />
      <FormField label="Add a person" id="group-member-search" hint="Search by name or email">
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
        {pending ? 'Adding…' : 'Add to group'}
      </Button>
    </form>
  );
}

function MemberRow({
  groupId,
  member,
  onChanged,
}: {
  groupId: string;
  member: ResolvedGroupMember;
  onChanged: () => void;
}) {
  const [run, pending] = useActionRunner();

  return (
    <li className={styles.compactRow}>
      <span className={styles.compactRowIdentity}>
        <Avatar name={member.name ?? member.email} src={member.image ?? undefined} size="sm" />
        <span className={styles.compactRowLabel}>
          <span className={styles.compactRowTitle}>{member.name ?? member.email}</span>
          {member.name && <span className={styles.compactRowSubtitle}>{member.email}</span>}
        </span>
      </span>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() => {
          const fd = new FormData();
          fd.set('groupId', groupId);
          fd.set('userId', member.userId);
          void run(() => removeGroupMemberAction(fd)).then((result) => {
            if (result.ok) onChanged();
          });
        }}
      >
        {pending ? 'Removing…' : 'Remove'}
      </Button>
    </li>
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
    <ul className={styles.compactList}>
      {members.map((member) => (
        <MemberRow key={member.userId} groupId={groupId} member={member} onChanged={onChanged} />
      ))}
    </ul>
  );
}

/**
 * Delete behind a `ConfirmDialog` (the same pattern Users and Apps use —
 * this was an inline two-step with two red buttons). A group still used by
 * an app access policy comes back `blocked`; the dialog then re-arms as
 * "Delete anyway" instead of dead-ending.
 */
function DeleteGroup({ group }: { group: GroupSummary }) {
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, pending] = useActionRunner();

  function close() {
    setOpen(false);
    setBlocked(false);
    setError(null);
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className={styles.selfStart}
        onClick={() => setOpen(true)}
      >
        Delete group
      </Button>
      <ConfirmDialog
        open={open}
        onClose={close}
        title={`Delete "${group.name}"?`}
        message={
          blocked
            ? 'This group is used by an app access policy. Deleting it removes the group from that policy, and anyone who relied on it loses that access. This cannot be undone.'
            : 'Deleting removes the group and its membership. This cannot be undone.'
        }
        confirmLabel={pending ? 'Deleting…' : blocked ? 'Delete anyway' : 'Delete group'}
        destructive
        pending={pending}
        error={blocked ? null : error}
        onConfirm={() => {
          const fd = new FormData();
          fd.set('id', group.id);
          if (blocked) fd.set('force', 'true');
          void run(() => deleteGroupAction(fd)).then((result: ActionResult) => {
            if (result.ok) {
              close();
            } else if (result.blocked) {
              setBlocked(true);
            } else {
              setError(result.error);
            }
          });
        }}
      />
    </>
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
  const [saveState, saveAction, saving] = useActionState<ActionResult | null, FormData>(
    updateGroupAction,
    null,
  );
  const toast = useToast();

  useEffect(() => {
    if (saveState?.ok) {
      toast.show({ title: saveState.message ?? 'Saved.', category: 'success' });
    }
  }, [saveState, toast]);

  const refreshMembers = useCallback(() => {
    listResolvedGroupMembers(group.id)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [group.id]);

  useEffect(() => {
    refreshMembers();
  }, [refreshMembers]);

  return (
    <div className={styles.detailFieldsStack}>
      <DetailSection title="Details">
        <form
          action={saveAction}
          className={[styles.inviteForm, styles.inviteFormCompact].join(' ')}
        >
          <input type="hidden" name="id" value={group.id} />
          <FormField label="Name" id={`group-name-${group.id}`} required>
            {(field) => <Input {...field} name="name" defaultValue={group.name} required />}
          </FormField>
          <FormField label="Description" id={`group-description-${group.id}`}>
            {(field) => (
              <Input {...field} name="description" defaultValue={group.description ?? ''} />
            )}
          </FormField>
          <ActionFeedback result={saveState} />
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </DetailSection>

      <DetailSection title="Members">
        {members === null ? (
          <p className={styles.textMuted}>Loading…</p>
        ) : (
          <MemberList groupId={group.id} members={members} onChanged={refreshMembers} />
        )}
        <MemberPicker groupId={group.id} onChanged={refreshMembers} />
      </DetailSection>

      <DetailSection title="Danger zone">
        <DeleteGroup group={group} />
      </DetailSection>
    </div>
  );
}

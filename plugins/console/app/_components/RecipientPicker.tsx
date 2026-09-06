'use client';

import { useEffect, useId, useState } from 'react';
import { Avatar, Button, FormField, Input } from '@sovereignfs/ui';
import type { DirectoryUser } from '@sovereignfs/sdk';
import { searchRecipientsAction } from '../_lib/recipients-actions';
import styles from '../console.module.css';

const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

/**
 * Pick one or more people from the directory — replaces the "paste user IDs
 * separated by commas" textarea on Broadcast and Messages. Same
 * search-then-select interaction as the Groups member picker and the Apps
 * access picker, with the chosen people listed as removable rows.
 */
export function RecipientPicker({
  value,
  onChange,
  disabled,
  label = 'Recipients',
}: {
  value: DirectoryUser[];
  onChange: (next: DirectoryUser[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DirectoryUser[]>([]);

  useEffect(() => {
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchRecipientsAction(query.trim())
        .then((users) => {
          if (!cancelled) setResults(users.filter((u) => !value.some((v) => v.id === u.id)));
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, value]);

  return (
    <div className={styles.fieldStack}>
      <FormField
        label={label}
        id={`recipients-${id}`}
        hint="Search by name or email, then pick from the results."
      >
        {(field) => (
          <div>
            <Input
              {...field}
              value={query}
              disabled={disabled}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search by name or email"
              autoComplete="off"
            />
            {results.length > 0 && (
              <ul
                className={[styles.compactList, styles.compactListBelowInput].join(' ')}
                aria-label="Search results"
              >
                {results.map((user) => (
                  <li key={user.id} className={styles.compactRow}>
                    <button
                      type="button"
                      className={styles.compactRowButton}
                      onClick={() => {
                        onChange([...value, user]);
                        setQuery('');
                        setResults([]);
                      }}
                    >
                      {user.name ?? user.email}
                      {user.name ? ` (${user.email})` : ''}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </FormField>

      {value.length > 0 && (
        <ul className={styles.compactList} aria-label="Selected recipients">
          {value.map((user) => (
            <li key={user.id} className={styles.compactRow}>
              <span className={styles.compactRowIdentity}>
                <Avatar name={user.name ?? user.email} src={user.image ?? undefined} size="sm" />
                <span className={styles.compactRowLabel}>
                  <span className={styles.compactRowTitle}>{user.name ?? user.email}</span>
                  {user.name && <span className={styles.compactRowSubtitle}>{user.email}</span>}
                </span>
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled}
                onClick={() => onChange(value.filter((v) => v.id !== user.id))}
                aria-label={`Remove ${user.name ?? user.email}`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

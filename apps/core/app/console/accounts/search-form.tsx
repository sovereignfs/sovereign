'use client';

import Link from 'next/link';
import { Button, FormField, Input } from '@sovereignfs/ui';
import styles from './accounts.module.css';

/** Finds accounts by part of a name or an email address. A plain form, so it works before the page has loaded. */
export function SearchForm({ query }: { query: string }) {
  return (
    <form className={styles.search} action="/console/accounts" method="get" role="search">
      <div className={styles.searchField}>
        <FormField label="Search accounts">
          {(field) => (
            <Input
              {...field}
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Name or email address"
              autoComplete="off"
              maxLength={100}
            />
          )}
        </FormField>
      </div>
      <Button type="submit">Search</Button>
      {query === '' ? null : (
        <Link className={styles.back} href="/console/accounts">
          Clear
        </Link>
      )}
    </form>
  );
}

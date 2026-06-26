'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useRef } from 'react';
import styles from '../console.module.css';

export function ActivitySearch({ total, initialQ }: { total: number; initialQ: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set('q', value);
      } else {
        params.delete('q');
      }
      params.delete('page');
      router.replace(`${pathname}?${params.toString()}`);
    }, 300);
  }

  return (
    <div className={styles.activitySearchBar}>
      <svg
        className={styles.activitySearchIcon}
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
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <input
        type="search"
        placeholder="Search events or descriptions…"
        defaultValue={initialQ}
        onChange={handleChange}
        className={styles.activitySearchInput}
        aria-label="Search activity events"
      />
      <span className={styles.activitySearchCount}>{total} events</span>
    </div>
  );
}

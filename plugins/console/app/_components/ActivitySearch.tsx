'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useRef } from 'react';
import { SearchBar } from './SearchBar';

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
    <SearchBar
      defaultValue={initialQ}
      onChange={handleChange}
      placeholder="Search events or descriptions…"
      aria-label="Search activity events"
      count={`${total} ${total === 1 ? 'event' : 'events'}`}
    />
  );
}

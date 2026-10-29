'use client';

import { useRouter } from 'next/navigation';
import { Pagination } from '@sovereignfs/ui';

/** Goes to another page of the list, keeping what was searched for. */
export function AccountsPagination({
  page,
  pages,
  query,
}: {
  page: number;
  pages: number;
  query: string;
}) {
  const router = useRouter();
  return (
    <Pagination
      page={page}
      totalPages={pages}
      aria-label="Pages of accounts"
      onChange={(next) => {
        const params = new URLSearchParams();
        if (query !== '') params.set('q', query);
        if (next > 1) params.set('page', String(next));
        const text = params.toString();
        router.push(text === '' ? '/console/accounts' : `/console/accounts?${text}`);
      }}
    />
  );
}

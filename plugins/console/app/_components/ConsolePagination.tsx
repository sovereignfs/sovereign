import Link from 'next/link';
import styles from '../console.module.css';

/**
 * Link-based pagination for server-rendered Console lists (Users, Activity)
 * — `@sovereignfs/ui`'s `Pagination` is callback-driven for client state;
 * these pages page via `?page=` so the URL stays shareable and the Server
 * Component refetches. `replace` keeps paging from stacking history.
 * `hrefFor` lets a page preserve its other query params (a search `q`).
 */
export function ConsolePagination({
  page,
  totalPages,
  rangeStart,
  rangeEnd,
  total,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  return (
    <nav className={styles.usersPagination} aria-label="Pagination">
      <span className={styles.paginationInfo}>
        {total === 0 ? 'Nothing to show' : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
      </span>
      <div className={styles.paginationControls}>
        {page > 1 ? (
          <Link replace href={hrefFor(page - 1)} className={styles.paginationLink}>
            Previous
          </Link>
        ) : (
          <span className={styles.paginationDisabled} aria-disabled="true">
            Previous
          </span>
        )}
        <span className={styles.paginationInfo} aria-current="page">
          {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <Link replace href={hrefFor(page + 1)} className={styles.paginationLink}>
            Next
          </Link>
        ) : (
          <span className={styles.paginationDisabled} aria-disabled="true">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}

import { Icon } from '../Icon/Icon';
import styles from './Pagination.module.css';

export interface PaginationProps {
  /** 1-indexed current page. */
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
  'aria-label'?: string;
}

type PageEntry = number | 'ellipsis';

/** First page, last page, current page ± 1 sibling, ellipsis for gaps. */
function getPageList(page: number, totalPages: number): PageEntry[] {
  if (totalPages <= 1) return [1];

  const siblingCount = 1;
  const startPage = Math.max(2, page - siblingCount);
  const endPage = Math.min(totalPages - 1, page + siblingCount);

  const pages: PageEntry[] = [1];
  if (startPage > 2) pages.push('ellipsis');
  for (let p = startPage; p <= endPage; p++) {
    pages.push(p);
  }
  if (endPage < totalPages - 1) pages.push('ellipsis');
  pages.push(totalPages);
  return pages;
}

export function Pagination({
  page,
  totalPages,
  onChange,
  className,
  'aria-label': ariaLabel = 'Pagination',
}: PaginationProps) {
  const pages = getPageList(page, totalPages);

  return (
    <nav aria-label={ariaLabel} className={[styles.nav, className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={styles.navButton}
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <Icon name="chevron-left" size="sm" aria-hidden />
      </button>
      <ul className={styles.list}>
        {pages.map((p, index) =>
          p === 'ellipsis' ? (
            <li key={`ellipsis-${index}`} className={styles.ellipsis} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p}>
              <button
                type="button"
                className={[styles.pageButton, p === page ? styles.active : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onChange(p)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p}`}
              >
                {p}
              </button>
            </li>
          ),
        )}
      </ul>
      <button
        type="button"
        className={styles.navButton}
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        <Icon name="chevron-right" size="sm" aria-hidden />
      </button>
    </nav>
  );
}

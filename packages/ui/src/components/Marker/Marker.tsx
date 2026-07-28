import styles from './Marker.module.css';

export interface MarkerProps {
  /** The number shown in the marker, e.g. 1, 2, 3. */
  index: number;
  /** Accessible label describing the citation, e.g. "Source: Notes". */
  label: string;
  /** Reveals source details (e.g. opens a source trace panel) when given. */
  onClick?: () => void;
  className?: string;
}

/**
 * Marker — inline citation/reference marker, for attributing part of an
 * assistant's answer to a source (matches RFC 0040's "source trace" —
 * Harness shows which plugin/data source informed an answer).
 */
export function Marker({ index, label, onClick, className }: MarkerProps) {
  const classes = [styles.marker, className].filter(Boolean).join(' ');

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={label} className={classes}>
        {index}
      </button>
    );
  }

  return (
    <span aria-label={label} className={classes}>
      {index}
    </span>
  );
}

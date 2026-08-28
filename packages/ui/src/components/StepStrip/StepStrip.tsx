import type { ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import styles from './StepStrip.module.css';

export interface StepStripItem {
  id: string;
}

export interface StepStripProps<T extends StepStripItem> {
  items: T[];
  activeId: string | null;
  /** Full control over each chip's content, click handling, and (if needed) drag-reorder wiring. */
  renderItem: (item: T, state: { isActive: boolean; index: number }) => ReactNode;
  /** Trailing dashed "add" chip — omit to render the strip with no add affordance. */
  onAdd?: () => void;
  addLabel?: string;
  className?: string;
  'aria-label'?: string;
}

/**
 * StepStrip — a horizontal, connected sequence of steps (a route or
 * itinerary strip): ordered chips joined by a thin connector line, with an
 * optional trailing dashed "add" chip. Purely presentational — it owns
 * layout and the connector lines, nothing else.
 *
 * Each chip's content, active styling, and click handling are entirely up
 * to `renderItem`; if a consumer needs drag-reorder, `renderItem` attaches
 * its own dnd-kit `useSortable` ref/listeners to whatever it returns. This
 * mirrors `DragHandleRow`'s existing split (DS owns chrome, consumer wires
 * dnd-kit via passed-through props) generalized for a horizontal,
 * handle-less strip where the whole rendered item — not a separate handle
 * icon — is both the click target and the drag surface.
 */
export function StepStrip<T extends StepStripItem>({
  items,
  activeId,
  renderItem,
  onAdd,
  addLabel = 'Add',
  className,
  'aria-label': ariaLabel,
}: StepStripProps<T>) {
  return (
    <div
      className={[styles.strip, className].filter(Boolean).join(' ')}
      role="list"
      aria-label={ariaLabel}
    >
      {items.map((item, index) => (
        <div key={item.id} className={styles.step} role="listitem">
          {renderItem(item, { isActive: item.id === activeId, index })}
          {(index < items.length - 1 || onAdd) && (
            <div
              className={[
                styles.connector,
                index === items.length - 1 ? styles.connectorDashed : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            />
          )}
        </div>
      ))}
      {onAdd && (
        <button type="button" className={styles.addChip} onClick={onAdd}>
          <Icon name="plus" size="sm" aria-hidden={true} />
          {addLabel}
        </button>
      )}
    </div>
  );
}

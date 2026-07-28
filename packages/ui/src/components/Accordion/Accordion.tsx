import type { ReactNode } from 'react';
import { Collapsible } from '../Collapsible/Collapsible';
import styles from './Accordion.module.css';

export interface AccordionItem {
  id: string;
  trigger: ReactNode;
  content: ReactNode;
}

export interface AccordionProps {
  items: AccordionItem[];
  /** `single` closes other sections when one opens. `multiple` allows any
   * number of sections open at once. */
  type: 'single' | 'multiple';
  openIds: string[];
  onOpenIdsChange: (openIds: string[]) => void;
  className?: string;
}

/**
 * Accordion — one or more `Collapsible` sections.
 *
 * Keyboard support (Enter/Space toggles the focused trigger) comes from
 * `Collapsible`'s real `<button>` — no arrow-key roving-tabindex handling
 * here, since accordion sections aren't a roving-tabindex widget per the
 * WAI-ARIA accordion pattern (each trigger is independently Tab-focusable).
 */
export function Accordion({ items, type, openIds, onOpenIdsChange, className }: AccordionProps) {
  function handleOpenChange(id: string, open: boolean) {
    if (type === 'single') {
      onOpenIdsChange(open ? [id] : []);
      return;
    }
    onOpenIdsChange(open ? [...openIds, id] : openIds.filter((openId) => openId !== id));
  }

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      {items.map((item) => (
        <Collapsible
          key={item.id}
          id={item.id}
          trigger={item.trigger}
          open={openIds.includes(item.id)}
          onOpenChange={(open) => handleOpenChange(item.id, open)}
        >
          {item.content}
        </Collapsible>
      ))}
    </div>
  );
}

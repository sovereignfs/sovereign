'use client';

import type { ReactNode } from 'react';
import { Checkbox } from '../Checkbox/Checkbox';
import styles from './MemberMultiSelect.module.css';

export interface MemberMultiSelectOption {
  id: string;
  label: string;
}

export interface MemberMultiSelectProps {
  options: MemberMultiSelectOption[];
  selectedIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  /** Rendered to the right of a selected row only — e.g. a per-person `CurrencyInput` or share count. */
  renderTrailing?: (id: string) => ReactNode;
  /** Section label above the list, e.g. "Paid by" or "Split between". */
  label?: string;
  /** Helper/validation text below the list, e.g. a running total. */
  hint?: ReactNode;
  className?: string;
}

/**
 * MemberMultiSelect — checkbox list for picking any number of people from an
 * already-resolved set of options (group/project members, collaborators,
 * etc.). Deliberately domain-agnostic about *who* an option represents —
 * instance users and guest members are both just `{id, label}` here, so
 * nothing special is needed to include guests alongside instance users; the
 * caller's `options` array is the only place that distinction exists.
 *
 * Not a directory search or an "add a new guest" flow — pair with
 * `SuggestionInput` (search + add) for that; this component only selects
 * among options already passed in.
 */
export function MemberMultiSelect({
  options,
  selectedIds,
  onToggle,
  renderTrailing,
  label,
  hint,
  className,
}: MemberMultiSelectProps) {
  return (
    <div className={[styles.group, className].filter(Boolean).join(' ')}>
      {label && <span className={styles.label}>{label}</span>}
      {options.map((option) => {
        const checked = selectedIds.has(option.id);
        return (
          <div key={option.id} className={styles.row}>
            <Checkbox
              checked={checked}
              onChange={(next) => onToggle(option.id, next)}
              label={option.label}
            />
            {checked && renderTrailing && (
              <span className={styles.trailing}>{renderTrailing(option.id)}</span>
            )}
          </div>
        );
      })}
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}

'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, Icon, Popover } from '@sovereignfs/ui';
import type { DiscoveredModel } from '../_lib/model-discovery';
import styles from './model-picker.module.css';

export interface ModelProviderInfo {
  id: string;
  label: string;
}

interface ModelGroup {
  id: string;
  label: string;
  models: DiscoveredModel[];
}

/** Strips the provider prefix a model's key already carries — redundant
 *  once the model is rendered under its own provider's group heading.
 *  Mirrors `ModelsView`'s own `displayLabel` (not shared — that component's
 *  version is entangled with its status-badge/search concerns this popover
 *  doesn't need). */
function displayLabel(model: DiscoveredModel): string {
  if (model.key === 'local') return model.label;
  const separatorIndex = model.key.indexOf(':');
  return separatorIndex === -1 ? model.label : model.key.slice(separatorIndex + 1);
}

function buildGroups(models: DiscoveredModel[], providers: ModelProviderInfo[]): ModelGroup[] {
  const groups: ModelGroup[] = [];
  const localModels = models.filter((model) => model.key === 'local');
  if (localModels.length > 0) {
    groups.push({ id: 'local', label: 'Local model', models: localModels });
  }
  for (const provider of providers) {
    const providerModels = models.filter((model) => model.key.startsWith(`${provider.id}:`));
    if (providerModels.length > 0) {
      groups.push({ id: provider.id, label: provider.label, models: providerModels });
    }
  }
  return groups;
}

/**
 * Warden composer's model picker (RFC 0063 §12, epic task 22.11) — a
 * `Popover` grouped by provider, mirroring `ModelsView`'s existing
 * grouping, with a footer linking into Settings → Providers/Models so "I
 * don't see the model I want" resolves in one click. Replaces the inline
 * `<select>` the composer used before this leg.
 */
export function ModelPickerPopover({
  models,
  providers,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  models: DiscoveredModel[];
  providers: ModelProviderInfo[];
  value: string;
  onChange: (key: string) => void;
  /** Shown as the trigger label when no model is selected (e.g. every
   *  model is hidden, or none was ever reachable). */
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const groups = buildGroups(models, providers);
  const selected = models.find((model) => model.key === value);

  // Flattened in render order so arrow keys can walk straight across group
  // boundaries — a user pressing Down doesn't think in provider groups.
  const flatModels = groups.flatMap((group) => group.models);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  // Focus moves into the listbox on open (and starts on the current
  // selection, not the top of a 400-model catalog); `Popover` is non-modal
  // and does not manage focus itself. Selecting or dismissing hands focus
  // back to the trigger, which otherwise ends up on `<body>` when the panel
  // unmounts from under it.
  useEffect(() => {
    if (!open) return;
    const selectedIndex = flatModels.findIndex((model) => model.key === value);
    setActiveIndex(selectedIndex === -1 ? 0 : selectedIndex);
    listRef.current?.focus();
    // Intentionally keyed on `open` alone: `value`/`flatModels` are read
    // only to pick a starting point at the moment of opening, and
    // re-running on either would fight the user's own arrow-key movement.
  }, [open]);

  function focusTrigger() {
    document.getElementById(triggerId)?.focus();
  }

  function close({ restoreFocus = true }: { restoreFocus?: boolean } = {}) {
    setOpen(false);
    if (restoreFocus) focusTrigger();
  }

  function selectModel(key: string) {
    onChange(key);
    close();
  }

  function handleListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (flatModels.length === 0) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % flatModels.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + flatModels.length) % flatModels.length);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(flatModels.length - 1);
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const model = flatModels[activeIndex];
        if (model) selectModel(model.key);
        break;
      }
      case 'Escape':
        // Popover closes itself on Escape; this only restores focus.
        event.preventDefault();
        close();
        break;
      default:
        break;
    }
  }

  return (
    <Popover
      // Lets the trigger shrink (and its label ellipsize) when the composer
      // toolbar runs out of room, instead of pushing Send out of the box.
      className={styles.triggerContainer}
      trigger={
        <Button
          type="button"
          id={triggerId}
          variant="ghost"
          size="sm"
          className={styles.trigger}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
        >
          <span className={styles.triggerLabel}>
            {selected ? displayLabel(selected) : placeholder}
          </span>
          <Icon name="chevron-down" size="sm" aria-hidden className={styles.triggerChevron} />
        </Button>
      }
      open={open}
      // Outside-click/Escape dismissal from within `Popover` itself — leave
      // focus wherever the user put it rather than yanking it back.
      onClose={() => close({ restoreFocus: false })}
      align="left"
      width={280}
      aria-label="Model"
    >
      {/*
        A real listbox, not a stack of buttons: the inline `<select>` this
        replaced was keyboard- and screen-reader-navigable for free, and a
        400-model catalog is exactly where losing that hurts most. Focus
        stays on the container and `aria-activedescendant` points at the
        current option, rather than moving DOM focus per option — simpler to
        keep correct inside a popover that does not trap focus.
      */}
      <div
        ref={listRef}
        className={styles.list}
        role="listbox"
        tabIndex={-1}
        aria-label="Model"
        aria-activedescendant={flatModels.length > 0 ? optionId(activeIndex) : undefined}
        onKeyDown={handleListKeyDown}
      >
        {groups.length === 0 && <p className={styles.empty}>{placeholder}</p>}
        {groups.map((group) => (
          <div key={group.id} className={styles.group} role="group" aria-label={group.label}>
            <p className={styles.groupLabel} aria-hidden>
              {group.label}
            </p>
            {group.models.map((model) => {
              const index = flatModels.indexOf(model);
              const classNames = [styles.item];
              if (model.key === value) classNames.push(styles.itemSelected);
              if (index === activeIndex) classNames.push(styles.itemActive);
              return (
                <button
                  key={model.key}
                  id={optionId(index)}
                  type="button"
                  role="option"
                  aria-selected={model.key === value}
                  // Out of the tab order on purpose — focus stays on the
                  // listbox and `aria-activedescendant` tracks the cursor.
                  tabIndex={-1}
                  className={classNames.join(' ')}
                  onClick={() => selectModel(model.key)}
                  onMouseMove={() => setActiveIndex(index)}
                >
                  {displayLabel(model)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className={styles.footer}>
        <Link href="/warden/providers" className={styles.footerLink} onClick={() => setOpen(false)}>
          Manage providers
        </Link>
        <Link href="/warden/models" className={styles.footerLink} onClick={() => setOpen(false)}>
          Manage models
        </Link>
      </div>
    </Popover>
  );
}

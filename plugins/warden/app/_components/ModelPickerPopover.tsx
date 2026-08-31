'use client';

import { useState } from 'react';
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

  function selectModel(key: string) {
    onChange(key);
    setOpen(false);
  }

  return (
    <Popover
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={styles.trigger}
          disabled={disabled}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
        >
          {selected ? displayLabel(selected) : placeholder}
          <Icon name="chevron-down" size="sm" aria-hidden />
        </Button>
      }
      open={open}
      onClose={() => setOpen(false)}
      align="left"
      width={280}
      aria-label="Model"
    >
      <div className={styles.list}>
        {groups.length === 0 && <p className={styles.empty}>{placeholder}</p>}
        {groups.map((group) => (
          <div key={group.id} className={styles.group}>
            <p className={styles.groupLabel}>{group.label}</p>
            {group.models.map((model) => (
              <button
                key={model.key}
                type="button"
                className={
                  model.key === value ? `${styles.item} ${styles.itemSelected}` : styles.item
                }
                onClick={() => selectModel(model.key)}
              >
                {displayLabel(model)}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className={styles.footer}>
        <Link
          href="/warden/settings?tab=providers"
          className={styles.footerLink}
          onClick={() => setOpen(false)}
        >
          Manage providers
        </Link>
        <Link
          href="/warden/settings?tab=models"
          className={styles.footerLink}
          onClick={() => setOpen(false)}
        >
          Manage models
        </Link>
      </div>
    </Popover>
  );
}

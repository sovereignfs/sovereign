'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, EmptyState, Icon, StatusBadge, useToast } from '@sovereignfs/ui';
import type { StatusBadgeStatus } from '@sovereignfs/ui';
import { refreshModelDiscoveryAction, setModelVisibilityBulkAction } from '../actions';
import type { DiscoveredModel, ModelDiscoveryResult } from '../_lib/model-discovery';
import { isModelVisible } from '../_lib/model-visibility-policy';
import { ModelToggleRow } from './ModelToggleRow';
import styles from './models.module.css';

interface ModelEntry {
  key: string;
  label: string;
}

interface ModelGroup {
  id: string;
  label: string;
  badge: { status: StatusBadgeStatus; label: string } | null;
  models: ModelEntry[];
}

/** Strips the provider prefix a model's key already carries — redundant
 *  once the model is rendered under its own provider's group heading. */
function displayLabel(model: DiscoveredModel): string {
  if (model.key === 'local') return model.label;
  const separatorIndex = model.key.indexOf(':');
  return separatorIndex === -1 ? model.label : model.key.slice(separatorIndex + 1);
}

function buildGroups(discovery: ModelDiscoveryResult): ModelGroup[] {
  const groups: ModelGroup[] = [];

  if (discovery.local.available) {
    groups.push({
      id: 'local',
      label: 'Local model',
      badge: null,
      models: discovery.models
        .filter((model) => model.key === 'local')
        .map((model) => ({ key: model.key, label: displayLabel(model) })),
    });
  }

  for (const provider of discovery.providers) {
    groups.push({
      id: provider.id,
      label: provider.label,
      badge: provider.ok ? null : { status: 'error', label: provider.message ?? 'Unreachable' },
      models: discovery.models
        .filter((model) => model.key.startsWith(`${provider.id}:`))
        .map((model) => ({ key: model.key, label: displayLabel(model) })),
    });
  }

  return groups;
}

/** A model matches if its own name matches, or if its provider's name does
 *  — so searching "OpenRouter" surfaces the whole group, not just models
 *  with that literal string in their id. */
function matchesQuery(group: ModelGroup, model: ModelEntry, query: string): boolean {
  return model.label.toLowerCase().includes(query) || group.label.toLowerCase().includes(query);
}

/**
 * Warden's model visibility settings (curation across all connected
 * providers). `discovery`/`visibilityOverrides` come from the Server
 * Component page's own props — mutations happen row-by-row
 * (`ModelToggleRow`, purely optimistic), so this component only needs
 * `router.refresh()` for the "Recheck models" action, not after every
 * toggle. The search box is a client-only filter over the already-loaded
 * list — a single provider's catalog can run into the hundreds
 * (OpenRouter returns 400+), so filtering here means never re-fetching.
 *
 * "Recheck models" drops the server's short-lived discovery cache
 * (`refreshModelDiscoveryAction`) before refreshing — otherwise
 * `router.refresh()` alone would just replay the cached result.
 */
export function ModelsView({
  discovery,
  visibilityOverrides,
}: {
  discovery: ModelDiscoveryResult;
  visibilityOverrides: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [isRefreshing, startTransition] = useTransition();
  const [bulkPendingGroup, setBulkPendingGroup] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const overrides = new Set(visibilityOverrides);

  const refresh = useCallback(() => {
    startTransition(async () => {
      await refreshModelDiscoveryAction();
      router.refresh();
    });
  }, [router]);

  /** "Show all" / "Hide all" for one provider's catalog — one round trip,
   *  then a refresh so every row re-seeds its own optimistic state. */
  function setGroupVisibility(group: ModelGroup, visible: boolean) {
    setBulkPendingGroup(group.id);
    startTransition(async () => {
      const result = await setModelVisibilityBulkAction(
        group.models.map((model) => model.key),
        visible,
      );
      if (!result.ok) toast.show({ title: result.error, category: 'error' });
      setBulkPendingGroup(null);
      router.refresh();
    });
  }

  const groups = buildGroups(discovery);

  if (groups.length === 0) {
    return (
      <EmptyState
        icon="link"
        heading="No models yet"
        description="Connect a provider first — models will show up here to curate once one is reachable."
      />
    );
  }

  const trimmedQuery = query.trim().toLowerCase();
  const total = groups.reduce((sum, group) => sum + group.models.length, 0);
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      models: trimmedQuery
        ? group.models.filter((model) => matchesQuery(group, model, trimmedQuery))
        : group.models,
    }))
    .filter((group) => group.models.length > 0 || (!trimmedQuery && group.models.length === 0));
  const shown = visibleGroups.reduce((sum, group) => sum + group.models.length, 0);

  return (
    <div className={styles.page}>
      <div className={styles.filterBar}>
        <label className={styles.searchBar} aria-label="Search models">
          <Icon name="search" size="sm" aria-hidden className={styles.searchIcon} />
          <input
            type="search"
            placeholder="Search models…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={styles.searchInput}
          />
          <span className={styles.searchCount}>
            {shown} of {total}
          </span>
        </label>
        <Button size="sm" variant="secondary" onClick={refresh} disabled={isRefreshing}>
          {isRefreshing ? 'Checking…' : 'Recheck models'}
        </Button>
      </div>

      {trimmedQuery && shown === 0 ? (
        <EmptyState
          icon="search"
          heading={`No models match "${query.trim()}"`}
          description="Try a different keyword."
        />
      ) : (
        visibleGroups.map((group) => (
          <section key={group.id} className={styles.group}>
            <div className={styles.groupHeader}>
              <h2 className={styles.groupTitle}>{group.label}</h2>
              {group.badge && (
                <StatusBadge status={group.badge.status}>{group.badge.label}</StatusBadge>
              )}
              {/* Per-provider bulk toggles: flipping a 400-model catalog one
                  switch at a time is not a real option, and "everything
                  from this provider" is the common intent either way. Acts
                  on the whole group, not the current search's subset — the
                  label says "all" and should mean it. */}
              {group.models.length > 1 && (
                <div className={styles.groupActions}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={bulkPendingGroup !== null}
                    aria-label={`Show all ${group.label} models`}
                    onClick={() => setGroupVisibility(group, true)}
                  >
                    Show all
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={bulkPendingGroup !== null}
                    aria-label={`Hide all ${group.label} models`}
                    onClick={() => setGroupVisibility(group, false)}
                  >
                    Hide all
                  </Button>
                </div>
              )}
            </div>
            {group.models.length === 0 ? (
              <p className={styles.emptyGroup}>No models currently reachable.</p>
            ) : (
              <div className={styles.list}>
                {group.models.map((model) => (
                  <ModelToggleRow
                    key={model.key}
                    modelKey={model.key}
                    label={model.label}
                    visible={isModelVisible(model.key, overrides)}
                  />
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}

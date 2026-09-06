'use client';

import { Badge } from '@sovereignfs/ui';
import { PluginAccessFields } from './PluginAccessFields';
import type { PluginRow } from './PluginsTable';
import { AppEnabledBadge } from '../_components/badges';
import { DetailIdRow, DetailPaneHeader } from '../_components/DetailPaneHeader';
import styles from '../console.module.css';

/**
 * Desktop `ThreeColumnLayout` detail column for a selected app —
 * consolidates the access-management fields that used to live behind
 * `PluginAccessDialog`'s dialog. Rendered via `ConsoleDetailSlot` from
 * `plugins/page.tsx`; `closeHref` drops the `?plugin=` param.
 *
 * Scoped narrower than the Users/Groups panes on purpose: Activate/Toggle
 * enable-disable/Open/Remove stay row-level actions rather than moving here
 * too — those are frequent, low-risk actions (especially "Open") that an
 * admin should be able to use without opening a detail pane every time.
 */
export function PluginDetailPane({ row, closeHref }: { row: PluginRow; closeHref: string }) {
  return (
    <div className={styles.detailPane}>
      <DetailPaneHeader
        title={row.name}
        subtitle={row.description ?? row.routePrefix}
        closeHref={closeHref}
        closeLabel="Close app detail"
      />

      <DetailIdRow value={row.id} label="Copy app ID" />

      <div className={styles.detailBadges}>
        <Badge variant="mono" size="sm">
          {row.type}
        </Badge>
        <code className={styles.codeInline}>{row.version}</code>
        <AppEnabledBadge enabled={row.status === 'enabled'} />
      </div>

      <PluginAccessFields pluginId={row.id} permissions={row.permissions} />
    </div>
  );
}

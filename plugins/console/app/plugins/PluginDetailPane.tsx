'use client';

import Link from 'next/link';
import { Badge, Icon } from '@sovereignfs/ui';
import { PluginAccessFields } from './PluginAccessFields';
import type { PluginRow } from './PluginsTable';
import styles from '../console.module.css';

/**
 * Desktop `ThreeColumnLayout` detail column for a selected plugin —
 * consolidates the access-management fields that used to live behind
 * `PluginAccessDialog`'s dialog. Rendered via `ConsoleDetailSlot` from
 * `plugins/page.tsx`; `closeHref` drops the `?plugin=` param.
 *
 * Scoped narrower than leg 2/3's detail panes on purpose: Activate/Toggle
 * enable-disable/Open/Remove stay row-level actions rather than moving here
 * too — those are frequent, low-risk actions (especially "Open") that an
 * admin should be able to use without opening a detail pane every time, and
 * this leg's own technical note names only `PluginAccessDialog`'s content as
 * moving. See workstream 0022 leg 4's Outcome note.
 */
export function PluginDetailPane({ row, closeHref }: { row: PluginRow; closeHref: string }) {
  return (
    <div className={styles.detailPane}>
      <div className={styles.detailHeader}>
        <div className={styles.detailHeading}>
          <span className={styles.detailTitle}>{row.name}</span>
          <span className={styles.detailSubtitle}>{row.description ?? row.routePrefix}</span>
        </div>
        <Link
          replace
          href={closeHref}
          className={styles.iconBtn}
          aria-label="Close app detail"
          title="Close"
        >
          <Icon name="x" size="sm" aria-hidden />
        </Link>
      </div>

      <span className={styles.userId} title="App ID">
        {row.id}
      </span>

      <div className={styles.detailBadges}>
        <Badge variant="mono">{row.type}</Badge>
        <code className={styles.codeInline}>{row.version}</code>
        {row.status === 'enabled' ? (
          <Badge variant="role">Enabled</Badge>
        ) : (
          <Badge variant="status" status="deactivated">
            Disabled
          </Badge>
        )}
      </div>

      <PluginAccessFields pluginId={row.id} permissions={row.permissions} />
    </div>
  );
}

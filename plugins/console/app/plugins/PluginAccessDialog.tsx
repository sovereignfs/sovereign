'use client';

import { useState } from 'react';
import { Dialog, Icon } from '@sovereignfs/ui';
import { PluginAccessFields } from './PluginAccessFields';
import styles from '../console.module.css';

/**
 * Mobile-only entry point — the Plugins table has no detail column to render
 * into there (desktop selects a row to open `PluginDetailPane` instead), so
 * this keeps a button+`Dialog` wrapper around the same `PluginAccessFields`
 * the desktop pane renders inline. Mirrors workstream 0022 leg 2/3's
 * `CapabilitiesButton`/`ManageGroupDialog`.
 */
export function PluginAccessDialog({
  pluginId,
  pluginName,
  permissions = [],
  open: controlledOpen,
  onOpenChange,
}: {
  pluginId: string;
  pluginName: string;
  /** The app's manifest-declared `permissions` array (GDPR-5) — shown read-only, not editable here. */
  permissions?: string[];
  /**
   * External control (e.g. a kebab `Menu` item on mobile plugin cards) —
   * when provided, this component renders only the `Dialog`, not its own
   * "Access" trigger button. Omit both for the default self-contained
   * behavior (own button + own open state).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setUncontrolledOpen;

  return (
    <>
      {!isControlled && (
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => setOpen(true)}
          title={`Access for "${pluginName}"`}
        >
          <Icon name="shield" size="sm" aria-hidden />
        </button>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        // "sm"'s width fits the common case (just a policy select); the
        // richer selected_users/selected_groups content scrolls internally
        // rather than clipping if it ever exceeds the size's max-height.
        size="sm"
        title={`Access for "${pluginName}"`}
      >
        {open && <PluginAccessFields pluginId={pluginId} permissions={permissions} />}
      </Dialog>
    </>
  );
}

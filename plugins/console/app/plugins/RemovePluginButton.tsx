'use client';

import { useState, useTransition } from 'react';
import { ConfirmDialog, Icon } from '@sovereignfs/ui';
import { removePluginAction } from './remove-actions';
import styles from '../console.module.css';

interface RemovePluginButtonProps {
  pluginId: string;
  pluginName: string;
  className?: string;
  label?: string;
  /**
   * External control (e.g. a kebab `Menu` item on mobile plugin cards) —
   * when provided, this component renders only the `ConfirmDialog`, not its
   * own trigger button. Omit both for the default self-contained behavior.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Remove button with confirm dialog and real server-side execution. */
export function RemovePluginButton({
  pluginId,
  pluginName,
  className,
  label,
  open: controlledOpen,
  onOpenChange,
}: RemovePluginButtonProps) {
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setUncontrolledOpen;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removePluginAction(pluginId);
      if (result.ok) {
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      {!isControlled && (
        <button
          type="button"
          className={className ?? styles.iconBtnDanger}
          onClick={() => setOpen(true)}
          aria-label={`Remove ${pluginName}`}
          title={`Remove ${pluginName}`}
        >
          {label ?? <Icon name="trash-2" size="sm" aria-hidden />}
        </button>
      )}

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Remove app"
        message={
          <>
            Remove <strong>{pluginName}</strong>? Its files and its own database will be deleted
            from the server. This cannot be undone without reinstalling.
          </>
        }
        confirmLabel={isPending ? 'Removing…' : 'Remove'}
        destructive
        pending={isPending}
        error={error}
        onConfirm={handleRemove}
      />
    </>
  );
}

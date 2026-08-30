'use client';

import { useState, useTransition } from 'react';
import { ConfirmDialog } from '@sovereignfs/ui';
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
          title={`Remove ${pluginName}`}
        >
          {label ?? (
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          )}
        </button>
      )}

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Remove app"
        message={
          <>
            Remove <strong>{pluginName}</strong>? Its files will be deleted from the server. This
            cannot be undone without reinstalling.
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

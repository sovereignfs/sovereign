'use client';

import { useState, useTransition } from 'react';
import { Badge, Button, ConfirmDialog, FormField, Input } from '@sovereignfs/ui';
import {
  checkPluginManifestAction,
  installPluginAction,
  removePluginAction,
  type ManifestPreview,
} from './install-actions';
import styles from '../console.module.css';

/** Two-step "Add a plugin" panel: validate manifest → confirm install. */
export function PluginInstallPanel() {
  const [repoUrl, setRepoUrl] = useState('');
  const [preview, setPreview] = useState<ManifestPreview | null>(null);
  const [installed, setInstalled] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [isChecking, startChecking] = useTransition();
  const [isInstalling, startInstalling] = useTransition();

  function resetState() {
    setPreview(null);
    setInstalled(false);
    setCheckError(null);
    setInstallError(null);
  }

  function handleUrlChange(v: string) {
    setRepoUrl(v);
    resetState();
  }

  function handleCheck() {
    resetState();
    startChecking(async () => {
      const result = await checkPluginManifestAction(repoUrl);
      if (result.ok) setPreview(result.manifest);
      else setCheckError(result.error);
    });
  }

  function handleInstall() {
    if (!preview) return;
    setInstallError(null);
    startInstalling(async () => {
      const result = await installPluginAction(repoUrl);
      if (result.ok) {
        setInstalled(true);
      } else {
        setInstallError(result.error);
      }
    });
  }

  return (
    <div className={styles.installPanel}>
      <div className={styles.installPanelBody}>
        <p className={styles.installPanelTitle}>Add a plugin</p>

        <div className={styles.installPanelRow}>
          <FormField label="Git repository URL" id="plugin-repo-url">
            {(field) => (
              <div className={styles.installPanelInputRow}>
                <Input
                  {...field}
                  className={styles.installPanelInputGrow}
                  type="url"
                  value={repoUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !isChecking && repoUrl && handleCheck()}
                  placeholder="https://github.com/sovereignfs/sovereign-plugin-template.git"
                  disabled={isInstalling}
                />
                <Button
                  type="button"
                  onClick={handleCheck}
                  disabled={!repoUrl.trim() || isChecking || isInstalling}
                >
                  {isChecking ? 'Checking…' : 'Check'}
                </Button>
              </div>
            )}
          </FormField>
        </div>

        {checkError && (
          <div className={styles.feedbackError}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ flexShrink: 0 }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {checkError}
          </div>
        )}

        {preview && (
          <div className={styles.installPreview}>
            <div className={styles.installPreviewInfo}>
              <span className={styles.installPreviewName}>{preview.name}</span>
              <span className={styles.installPreviewMeta}>
                {preview.id} · v{preview.version} · <Badge variant="mono">{preview.type}</Badge>
              </span>
              {preview.description && (
                <span className={styles.installPreviewDesc}>{preview.description}</span>
              )}
            </div>
            {installed ? (
              <span className={styles.installSuccess}>
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
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                Installed
              </span>
            ) : (
              <Button type="button" onClick={handleInstall} disabled={isInstalling}>
                {isInstalling ? 'Installing…' : 'Install'}
              </Button>
            )}
          </div>
        )}

        {installError && <div className={styles.feedbackError}>{installError}</div>}
      </div>
    </div>
  );
}

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
        title="Remove plugin"
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

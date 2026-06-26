'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Badge } from '@sovereignfs/ui';
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
          <label htmlFor="plugin-repo-url" className={styles.installPanelLabel}>
            Git repository URL
          </label>
          <div className={styles.installPanelInputRow}>
            <input
              id="plugin-repo-url"
              type="url"
              value={repoUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isChecking && repoUrl && handleCheck()}
              placeholder="https://github.com/sovereignfs/sovereign-plugin-template.git"
              className={styles.input}
              disabled={isInstalling}
            />
            <button
              type="button"
              className={styles.actionButton}
              onClick={handleCheck}
              disabled={!repoUrl.trim() || isChecking || isInstalling}
            >
              {isChecking ? 'Checking…' : 'Check'}
            </button>
          </div>
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
              <button
                type="button"
                className={styles.actionButton}
                onClick={handleInstall}
                disabled={isInstalling}
              >
                {isInstalling ? 'Installing…' : 'Install'}
              </button>
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
}

/** Remove button with confirm dialog and real server-side execution. */
export function RemovePluginButton({ pluginId, pluginName }: RemovePluginButtonProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) el.showModal();
    else el.close();
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handleClose = () => setOpen(false);
    el.addEventListener('close', handleClose);
    return () => el.removeEventListener('close', handleClose);
  }, []);

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
      <button
        type="button"
        className={styles.iconBtnDanger}
        onClick={() => setOpen(true)}
        title={`Remove ${pluginName}`}
      >
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
      </button>

      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={dialogRef}
        className={styles.confirmNativeDialog}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div className={styles.confirmDialog}>
          <h2 className={styles.confirmTitle}>Remove plugin</h2>
          <p className={styles.confirmMessage}>
            Remove <strong>{pluginName}</strong>? Its files will be deleted from the server. This
            cannot be undone without reinstalling.
          </p>
          {error && <p className={styles.feedbackError}>{error}</p>}
          <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.dangerButton}
              onClick={handleRemove}
              disabled={isPending}
            >
              {isPending ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

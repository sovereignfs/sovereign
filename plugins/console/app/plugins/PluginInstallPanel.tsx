'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import {
  checkPluginManifestAction,
  installPluginAction,
  removePluginAction,
  type ManifestPreview,
} from './install-actions';
import styles from '../console.module.css';

/** Two-step "Add a plugin" panel: validate manifest → confirm install. */
export function PluginInstallPanel() {
  const [open, setOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [preview, setPreview] = useState<ManifestPreview | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [installMsg, setInstallMsg] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [isChecking, startChecking] = useTransition();
  const [isInstalling, startInstalling] = useTransition();

  function resetState() {
    setPreview(null);
    setCheckError(null);
    setInstallMsg(null);
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
    setInstallMsg(null);
    setInstallError(null);
    startInstalling(async () => {
      const result = await installPluginAction(repoUrl);
      if (result.ok) {
        setInstallMsg(result.message);
        setRepoUrl('');
        setPreview(null);
      } else {
        setInstallError(result.error);
      }
    });
  }

  return (
    <div className={styles.installPanel}>
      <button
        type="button"
        className={styles.installPanelToggle}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>Add a plugin</span>
        <span className={styles.installPanelCaret}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className={styles.installPanelBody}>
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
                placeholder="https://github.com/example/my-plugin"
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

          {checkError && <p className={styles.feedbackError}>{checkError}</p>}

          {preview && (
            <div className={styles.installPreview}>
              <div className={styles.installPreviewInfo}>
                <span className={styles.installPreviewName}>{preview.name}</span>
                <span className={styles.installPreviewMeta}>
                  {preview.id} · v{preview.version} ·{' '}
                  <span
                    className={preview.type === 'platform' ? styles.badgeAdmin : styles.badgeUser}
                  >
                    {preview.type}
                  </span>
                </span>
                {preview.description && (
                  <span className={styles.installPreviewDesc}>{preview.description}</span>
                )}
              </div>
              <button
                type="button"
                className={styles.actionButton}
                onClick={handleInstall}
                disabled={isInstalling}
              >
                {isInstalling ? 'Installing…' : 'Install'}
              </button>
            </div>
          )}

          {installMsg && <p className={styles.feedbackSuccess}>{installMsg}</p>}
          {installError && <p className={styles.feedbackError}>{installError}</p>}
        </div>
      )}
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
        className={styles.deactivateButton}
        onClick={() => setOpen(true)}
        title={`Remove ${pluginName}`}
      >
        Remove
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

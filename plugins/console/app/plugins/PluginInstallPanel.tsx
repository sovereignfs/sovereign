'use client';

import { useState } from 'react';
import styles from '../console.module.css';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={styles.copyButton}
      aria-label="Copy command"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

/** Collapsible "Add a plugin" panel shown above the installed-plugins table. */
export function PluginInstallPanel() {
  const [open, setOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');

  const command = repoUrl.trim()
    ? `sv plugin add ${repoUrl.trim()}`
    : 'sv plugin add <git-repo-url>';

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
          <p className={styles.installPanelDesc}>
            Paste a Git repository URL to get the install command. Run it from the server (or with{' '}
            <code className={styles.codeInline}>pnpm</code> prefix in the monorepo). After
            installing, restart the server for changes to take effect in production.
          </p>

          <div className={styles.installPanelRow}>
            <label htmlFor="plugin-repo-url" className={styles.installPanelLabel}>
              Repository URL
            </label>
            <input
              id="plugin-repo-url"
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/example/my-plugin"
              className={styles.input}
            />
          </div>

          <div className={styles.installPanelCommand}>
            <code className={styles.installPanelCode}>{command}</code>
            <CopyButton text={command} />
          </div>

          <p className={styles.helpText}>
            After the command completes, a restart is required in production. In development, HMR
            picks up new routes automatically.
          </p>
        </div>
      )}
    </div>
  );
}

interface RemovePanelProps {
  pluginId: string;
  pluginName: string;
}

/** Inline remove button for non-platform plugins — shows CLI command + copy. */
export function RemovePluginButton({ pluginId, pluginName }: RemovePanelProps) {
  const [open, setOpen] = useState(false);
  const command = `sv plugin remove ${pluginId}`;

  return (
    <>
      <button
        type="button"
        className={styles.deactivateButton}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={`Remove ${pluginName}`}
      >
        Remove
      </button>

      {open && (
        <div className={styles.removePanel}>
          <p className={styles.removePanelDesc}>
            Run this command on the server to remove the plugin, then restart to apply:
          </p>
          <div className={styles.installPanelCommand}>
            <code className={styles.installPanelCode}>{command}</code>
            <CopyButton text={command} />
          </div>
        </div>
      )}
    </>
  );
}

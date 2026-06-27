'use client';

import { useState, useActionState } from 'react';
import { Input, Select, Button } from '@sovereignfs/ui';
import styles from '../console.module.css';
import {
  type ActionResult,
  updateTenantNameAction,
  updateInviteOnlyAction,
  updateRootPluginAction,
  updateInstanceAction,
  uploadLogoAction,
  uploadFaviconAction,
} from './actions';

function UploadIcon() {
  return (
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
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function FileDropZone({
  id,
  name,
  accept,
  hint,
}: {
  id: string;
  name: string;
  accept: string;
  hint: string;
}) {
  return (
    <label htmlFor={id} className={styles.fileDropZone}>
      <input id={id} name={name} type="file" accept={accept} className={styles.fileInputHidden} />
      <span className={styles.fileDropIcon}>
        <ImageIcon />
      </span>
      <span className={styles.fileDropText}>
        <span className={styles.fileDropLabel}>Choose a file</span>
        <span className={styles.fileDropHint}>{hint}</span>
      </span>
    </label>
  );
}

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p
      className={result.ok ? styles.feedbackSuccess : styles.feedbackError}
      role="status"
      aria-live="polite"
    >
      {result.ok ? result.message : result.error}
    </p>
  );
}

export function TenantForm({ initialName }: { initialName: string }) {
  const [state, action, pending] = useActionState(updateTenantNameAction, null);
  return (
    <form action={action} className={styles.settingsForm}>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="tenantName">
          Instance name
        </label>
        <Input id="tenantName" name="tenantName" type="text" required defaultValue={initialName} />
      </div>
      <Feedback result={state} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Save name'}
      </Button>
    </form>
  );
}

export function InviteOnlyForm({ initialValue }: { initialValue: boolean }) {
  const [state, action, pending] = useActionState(updateInviteOnlyAction, null);
  return (
    <form action={action} className={styles.settingsForm}>
      <label className={styles.checkboxRow}>
        <input type="checkbox" name="inviteOnly" defaultChecked={initialValue} />
        <span>
          Invite-only registration
          <span className={styles.helpText}>
            When enabled, only invited email addresses can register. The first user is always
            exempt.
          </span>
        </span>
      </label>
      <Feedback result={state} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Save registration policy'}
      </Button>
    </form>
  );
}

interface PluginOption {
  id: string;
  name: string;
}

export function RootPluginForm({
  candidates,
  currentId,
  currentInstalled,
}: {
  candidates: PluginOption[];
  currentId: string;
  currentInstalled: boolean;
}) {
  const [state, action, pending] = useActionState(updateRootPluginAction, null);
  return (
    <form action={action} className={styles.settingsForm}>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="rootPluginId">
          Plugin served at <code className={styles.codeInline}>/</code>
        </label>
        {candidates.length === 0 ? (
          <p className={styles.helpText}>
            No eligible plugins installed yet. The Launcher (the default root) arrives with the next
            platform task; until then <code className={styles.codeInline}>/</code> shows a
            placeholder.
          </p>
        ) : (
          <Select
            id="rootPluginId"
            name="rootPluginId"
            defaultValue={currentInstalled ? currentId : undefined}
          >
            {!currentInstalled && (
              <option value="" disabled>
                {currentId} (not installed)
              </option>
            )}
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </Select>
        )}
      </div>
      <Feedback result={state} />
      {candidates.length > 0 && (
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save root plugin'}
        </Button>
      )}
    </form>
  );
}

export interface InstanceValues {
  instanceName: string;
  instanceLogo: string | null;
  instanceLogoDark: string | null;
  instanceFavicon: string | null;
  instancePrimary: string | null;
  emailFromName: string | null;
  emailLogo: string | null;
}

export function InstanceForm({ initialValues }: { initialValues: InstanceValues }) {
  const [state, action, pending] = useActionState(updateInstanceAction, null);
  const [primaryColor, setPrimaryColor] = useState(initialValues.instancePrimary ?? '');

  const swatchValue = primaryColor.match(/^#[0-9a-fA-F]{6}$/) ? primaryColor : '#3b82f6';

  return (
    <form action={action} className={styles.settingsForm}>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="instanceName">
          Instance name
        </label>
        <Input
          id="instanceName"
          name="instanceName"
          type="text"
          placeholder="Sovereign"
          defaultValue={
            initialValues.instanceName !== 'Sovereign' ? initialValues.instanceName : ''
          }
        />
        <span className={styles.helpText}>Displayed in the shell header and login page.</span>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="instancePrimary">
          Primary colour
        </label>
        <div className={styles.colorRow}>
          <input
            type="color"
            value={swatchValue}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className={styles.colorSwatch}
            aria-label="Colour picker"
            tabIndex={-1}
          />
          <Input
            id="instancePrimary"
            name="instancePrimary"
            type="text"
            pattern="^#[0-9a-fA-F]{6}$"
            placeholder="#3b82f6"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
          />
        </div>
        <span className={styles.helpText}>
          6-digit hex. Sets <code className={styles.codeInline}>--sv-color-accent</code>. Leave
          blank to use the default.
        </span>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="instanceLogo">
          Logo URL <span className={styles.labelMeta}>(light theme)</span>
        </label>
        <Input
          id="instanceLogo"
          name="instanceLogo"
          type="url"
          placeholder="https://… or /api/instance/logo-light"
          defaultValue={initialValues.instanceLogo ?? ''}
        />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="instanceLogoDark">
          Logo URL <span className={styles.labelMeta}>(dark theme)</span>
        </label>
        <Input
          id="instanceLogoDark"
          name="instanceLogoDark"
          type="url"
          placeholder="https://… or /api/instance/logo-dark"
          defaultValue={initialValues.instanceLogoDark ?? ''}
        />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="instanceFavicon">
          Favicon URL
        </label>
        <Input
          id="instanceFavicon"
          name="instanceFavicon"
          type="url"
          placeholder="https://… or /api/instance/favicon"
          defaultValue={initialValues.instanceFavicon ?? ''}
        />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="emailFromName">
          Email sender name
        </label>
        <Input
          id="emailFromName"
          name="emailFromName"
          type="text"
          placeholder="Sovereign"
          defaultValue={initialValues.emailFromName ?? ''}
        />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="emailLogo">
          Email logo URL
        </label>
        <Input
          id="emailLogo"
          name="emailLogo"
          type="url"
          placeholder="https://…"
          defaultValue={initialValues.emailLogo ?? ''}
        />
        <span className={styles.helpText}>
          Used in outbound email HTML templates. Must be publicly reachable.
        </span>
      </div>

      <Feedback result={state} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Save instance identity'}
      </Button>
    </form>
  );
}

export function LogoUploadForm({ dark }: { dark: boolean }) {
  const [state, action, pending] = useActionState(uploadLogoAction, null);
  const fileId = dark ? 'logoDarkFile' : 'logoFile';
  return (
    <form action={action} className={styles.settingsForm}>
      <input type="hidden" name="dark" value={dark ? '1' : '0'} />
      <div className={styles.fieldGroup}>
        <span className={styles.label}>
          Logo <span className={styles.labelMeta}>({dark ? 'dark theme' : 'light theme'})</span>
        </span>
        <FileDropZone
          id={fileId}
          name="file"
          accept="image/png,image/svg+xml,image/jpeg,image/webp"
          hint="PNG, SVG, JPEG, or WebP · max 2 MB"
        />
      </div>
      <Feedback result={state} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? (
          'Uploading…'
        ) : (
          <>
            <UploadIcon /> Upload
          </>
        )}
      </Button>
    </form>
  );
}

export function FaviconUploadForm() {
  const [state, action, pending] = useActionState(uploadFaviconAction, null);
  return (
    <form action={action} className={styles.settingsForm}>
      <div className={styles.fieldGroup}>
        <span className={styles.label}>Favicon</span>
        <FileDropZone
          id="faviconFile"
          name="file"
          accept="image/png,image/svg+xml,image/x-icon,image/webp"
          hint="PNG, SVG, ICO, or WebP · max 2 MB"
        />
      </div>
      <Feedback result={state} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? (
          'Uploading…'
        ) : (
          <>
            <UploadIcon /> Upload
          </>
        )}
      </Button>
    </form>
  );
}

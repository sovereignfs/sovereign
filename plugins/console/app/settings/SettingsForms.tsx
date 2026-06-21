'use client';

import { useActionState } from 'react';
import styles from '../console.module.css';
import {
  type ActionResult,
  updateTenantNameAction,
  updateInviteOnlyAction,
  updateRootPluginAction,
  updateBrandingAction,
  uploadLogoAction,
  uploadFaviconAction,
} from './actions';

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
          Tenant name
        </label>
        <input
          id="tenantName"
          name="tenantName"
          type="text"
          required
          defaultValue={initialName}
          className={styles.input}
        />
      </div>
      <Feedback result={state} />
      <button type="submit" className={styles.actionButton} disabled={pending}>
        {pending ? 'Saving…' : 'Save name'}
      </button>
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
      <button type="submit" className={styles.actionButton} disabled={pending}>
        {pending ? 'Saving…' : 'Save registration policy'}
      </button>
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
          <select
            id="rootPluginId"
            name="rootPluginId"
            defaultValue={currentInstalled ? currentId : undefined}
            className={styles.roleSelect}
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
          </select>
        )}
      </div>
      <Feedback result={state} />
      {candidates.length > 0 && (
        <button type="submit" className={styles.actionButton} disabled={pending}>
          {pending ? 'Saving…' : 'Save root plugin'}
        </button>
      )}
    </form>
  );
}

export interface BrandingValues {
  brandName: string;
  brandLogo: string | null;
  brandLogoDark: string | null;
  brandFavicon: string | null;
  brandPrimary: string | null;
  emailFromName: string | null;
  emailLogo: string | null;
}

export function BrandingForm({ initialValues }: { initialValues: BrandingValues }) {
  const [state, action, pending] = useActionState(updateBrandingAction, null);
  return (
    <form action={action} className={styles.settingsForm}>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="brandName">
          Brand name
        </label>
        <input
          id="brandName"
          name="brandName"
          type="text"
          placeholder="Sovereign"
          defaultValue={initialValues.brandName !== 'Sovereign' ? initialValues.brandName : ''}
          className={styles.input}
        />
        <span className={styles.helpText}>Displayed in the shell header and login page.</span>
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="brandPrimary">
          Primary colour
        </label>
        <input
          id="brandPrimary"
          name="brandPrimary"
          type="text"
          pattern="^#[0-9a-fA-F]{6}$"
          placeholder="#3b82f6"
          defaultValue={initialValues.brandPrimary ?? ''}
          className={styles.input}
        />
        <span className={styles.helpText}>
          6-digit hex (e.g. <code className={styles.codeInline}>#3b82f6</code>). Sets{' '}
          <code className={styles.codeInline}>--sv-color-accent</code>. Leave blank to use the
          default.
        </span>
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="brandLogo">
          Logo URL (light theme)
        </label>
        <input
          id="brandLogo"
          name="brandLogo"
          type="url"
          placeholder="https://… or /api/brand/logo"
          defaultValue={initialValues.brandLogo ?? ''}
          className={styles.input}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="brandLogoDark">
          Logo URL (dark theme)
        </label>
        <input
          id="brandLogoDark"
          name="brandLogoDark"
          type="url"
          placeholder="https://… or /api/brand/logo?dark=1"
          defaultValue={initialValues.brandLogoDark ?? ''}
          className={styles.input}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="brandFavicon">
          Favicon URL
        </label>
        <input
          id="brandFavicon"
          name="brandFavicon"
          type="url"
          placeholder="https://… or /api/brand/favicon"
          defaultValue={initialValues.brandFavicon ?? ''}
          className={styles.input}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="emailFromName">
          Email sender name
        </label>
        <input
          id="emailFromName"
          name="emailFromName"
          type="text"
          placeholder="Sovereign"
          defaultValue={initialValues.emailFromName ?? ''}
          className={styles.input}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="emailLogo">
          Email logo URL
        </label>
        <input
          id="emailLogo"
          name="emailLogo"
          type="url"
          placeholder="https://…"
          defaultValue={initialValues.emailLogo ?? ''}
          className={styles.input}
        />
        <span className={styles.helpText}>
          Used in outbound email HTML templates. Must be publicly reachable.
        </span>
      </div>
      <Feedback result={state} />
      <button type="submit" className={styles.actionButton} disabled={pending}>
        {pending ? 'Saving…' : 'Save branding'}
      </button>
    </form>
  );
}

export function LogoUploadForm({ dark }: { dark: boolean }) {
  const [state, action, pending] = useActionState(uploadLogoAction, null);
  return (
    <form action={action} className={styles.settingsForm} style={{ marginTop: '8px' }}>
      <input type="hidden" name="dark" value={dark ? '1' : '0'} />
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor={dark ? 'logoDarkFile' : 'logoFile'}>
          {dark ? 'Upload logo (dark theme)' : 'Upload logo (light theme)'}
        </label>
        <input
          id={dark ? 'logoDarkFile' : 'logoFile'}
          name="file"
          type="file"
          accept="image/png,image/svg+xml,image/jpeg,image/webp"
          className={styles.input}
        />
        {!dark && <span className={styles.helpText}>PNG, SVG, JPEG, or WebP · max 2 MB</span>}
      </div>
      <Feedback result={state} />
      <button type="submit" className={styles.actionButton} disabled={pending}>
        {pending ? 'Uploading…' : 'Upload'}
      </button>
    </form>
  );
}

export function FaviconUploadForm() {
  const [state, action, pending] = useActionState(uploadFaviconAction, null);
  return (
    <form action={action} className={styles.settingsForm} style={{ marginTop: '8px' }}>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="faviconFile">
          Upload favicon
        </label>
        <input
          id="faviconFile"
          name="file"
          type="file"
          accept="image/png,image/svg+xml,image/x-icon,image/webp"
          className={styles.input}
        />
        <span className={styles.helpText}>PNG, SVG, ICO, or WebP · max 2 MB</span>
      </div>
      <Feedback result={state} />
      <button type="submit" className={styles.actionButton} disabled={pending}>
        {pending ? 'Uploading…' : 'Upload'}
      </button>
    </form>
  );
}

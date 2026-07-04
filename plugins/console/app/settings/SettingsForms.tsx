'use client';

import { useState, useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, FormField, Input, Select, useToast } from '@sovereignfs/ui';
import styles from '../console.module.css';
import {
  type ActionResult,
  updateTenantNameAction,
  updateInviteOnlyAction,
  updateExampleAppsAction,
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

// Success is surfaced as a toast (see useSaveResult); only errors render inline,
// next to the form that produced them.
function Feedback({ result }: { result: ActionResult | null }) {
  if (!result || result.ok) return null;
  return (
    <p className={styles.feedbackError} role="status" aria-live="polite">
      {result.error}
    </p>
  );
}

/**
 * On a successful settings action: show a success toast and refresh the current
 * route's server components. The refresh is what makes changes visible without a
 * manual reload — the Console renders as an overlay, so saving does not otherwise
 * re-render the launcher/sidebar behind it (e.g. showing/hiding example plugins).
 */
function useSaveResult(result: ActionResult | null) {
  const toast = useToast();
  const router = useRouter();
  useEffect(() => {
    if (result?.ok) {
      toast.show({ title: result.message, category: 'success' });
      router.refresh();
    }
  }, [result, toast, router]);
}

export function TenantForm({ initialName }: { initialName: string }) {
  const [state, action, pending] = useActionState(updateTenantNameAction, null);
  useSaveResult(state);
  return (
    <form action={action} className={styles.settingsForm}>
      <FormField label="Instance name" id="tenantName" required>
        {(field) => <Input {...field} name="tenantName" type="text" defaultValue={initialName} />}
      </FormField>
      <Feedback result={state} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Save name'}
      </Button>
    </form>
  );
}

export function InviteOnlyForm({ initialValue }: { initialValue: boolean }) {
  const [state, action, pending] = useActionState(updateInviteOnlyAction, null);
  useSaveResult(state);
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

export function ExampleAppsForm({ initialValue }: { initialValue: boolean }) {
  const [state, action, pending] = useActionState(updateExampleAppsAction, null);
  useSaveResult(state);
  return (
    <form action={action} className={styles.settingsForm}>
      <label className={styles.checkboxRow}>
        <input type="checkbox" name="examplesEnabled" defaultChecked={initialValue} />
        <span>
          Show example plugins
          <span className={styles.helpText}>
            The bundled reference/demo plugins ship hidden by default. Enable to show them in the
            launcher and sidebar. You can still enable or disable individual example plugins from
            the Plugins page.
          </span>
        </span>
      </label>
      <Feedback result={state} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Save example plugins'}
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
  useSaveResult(state);
  return (
    <form action={action} className={styles.settingsForm}>
      <FormField label="Plugin served at /" id="rootPluginId">
        {(field) =>
          candidates.length === 0 ? (
            <p className={styles.helpText}>
              No eligible plugins installed yet. The Launcher (the default root) arrives with the
              next platform task; until then <code className={styles.codeInline}>/</code> shows a
              placeholder.
            </p>
          ) : (
            <Select
              {...field}
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
          )
        }
      </FormField>
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
  useSaveResult(state);
  const [primaryColor, setPrimaryColor] = useState(initialValues.instancePrimary ?? '');

  const swatchValue = primaryColor.match(/^#[0-9a-fA-F]{6}$/) ? primaryColor : '#18181b';

  return (
    <form action={action} className={styles.settingsForm}>
      <FormField
        label="Instance name"
        id="instanceName"
        hint="Displayed in the shell header and login page."
      >
        {(field) => (
          <Input
            {...field}
            name="instanceName"
            type="text"
            placeholder="Sovereign"
            defaultValue={
              initialValues.instanceName !== 'Sovereign' ? initialValues.instanceName : ''
            }
          />
        )}
      </FormField>

      <FormField
        label="Primary colour"
        id="instancePrimary"
        hint="6-digit hex. Sets --sv-color-accent. Leave blank to use the default."
      >
        {(field) => (
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
              {...field}
              name="instancePrimary"
              type="text"
              pattern="^#[0-9a-fA-F]{6}$"
              placeholder="#18181b"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
            />
          </div>
        )}
      </FormField>

      <FormField label="Logo URL (light theme)" id="instanceLogo">
        {(field) => (
          <Input
            {...field}
            name="instanceLogo"
            type="url"
            placeholder="https://… or /api/instance/logo-light"
            defaultValue={initialValues.instanceLogo ?? ''}
          />
        )}
      </FormField>

      <FormField label="Logo URL (dark theme)" id="instanceLogoDark">
        {(field) => (
          <Input
            {...field}
            name="instanceLogoDark"
            type="url"
            placeholder="https://… or /api/instance/logo-dark"
            defaultValue={initialValues.instanceLogoDark ?? ''}
          />
        )}
      </FormField>

      <FormField label="Favicon URL" id="instanceFavicon">
        {(field) => (
          <Input
            {...field}
            name="instanceFavicon"
            type="url"
            placeholder="https://… or /api/instance/favicon"
            defaultValue={initialValues.instanceFavicon ?? ''}
          />
        )}
      </FormField>

      <FormField label="Email sender name" id="emailFromName">
        {(field) => (
          <Input
            {...field}
            name="emailFromName"
            type="text"
            placeholder="Sovereign"
            defaultValue={initialValues.emailFromName ?? ''}
          />
        )}
      </FormField>

      <FormField
        label="Email logo URL"
        id="emailLogo"
        hint="Used in outbound email HTML templates. Must be publicly reachable."
      >
        {(field) => (
          <Input
            {...field}
            name="emailLogo"
            type="url"
            placeholder="https://…"
            defaultValue={initialValues.emailLogo ?? ''}
          />
        )}
      </FormField>

      <Feedback result={state} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Save instance identity'}
      </Button>
    </form>
  );
}

export function LogoUploadForm({ dark }: { dark: boolean }) {
  const [state, action, pending] = useActionState(uploadLogoAction, null);
  useSaveResult(state);
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
  useSaveResult(state);
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

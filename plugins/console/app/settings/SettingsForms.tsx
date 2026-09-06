'use client';

import { useState, useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  FileDropzone,
  FormField,
  Icon,
  Input,
  Label,
  Select,
  useToast,
} from '@sovereignfs/ui';
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * DS `FileDropzone` with the picked file's name and size reflected in the
 * label — replaces a hand-rolled dashed drop zone with its own inline SVGs.
 */
function ImageDropzone({
  accept,
  hint,
  ariaLabel,
  disabled,
}: {
  accept: string;
  hint: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <FileDropzone
      name="file"
      accept={accept}
      icon={<Icon name="upload" size="lg" aria-hidden />}
      label={file ? file.name : 'Choose a file or drop it here'}
      hint={file ? formatFileSize(file.size) : hint}
      onFileSelect={setFile}
      ariaLabel={ariaLabel}
      disabled={disabled}
    />
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
          Show example apps
          <span className={styles.helpText}>
            The bundled reference/demo apps ship hidden by default. Enable to show them in the
            launcher and sidebar. You can still enable or disable individual example apps from the
            Apps page.
          </span>
        </span>
      </label>
      <Feedback result={state} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Save example apps'}
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
      <FormField label="App served at /" id="rootPluginId">
        {(field) =>
          candidates.length === 0 ? (
            <p className={styles.helpText}>
              No eligible apps installed yet. The Launcher (the default root) arrives with the next
              platform task; until then <code className={styles.codeInline}>/</code> shows a
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
          {pending ? 'Saving…' : 'Save root app'}
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
  instanceRadius: string | null;
  instanceThemePreset: string | null;
  emailFromName: string | null;
  emailLogo: string | null;
}

const RADIUS_OPTIONS = [
  { value: '', label: 'Default (M)' },
  { value: 'none', label: 'None — square corners' },
  { value: 'xs', label: 'XS' },
  { value: 's', label: 'S' },
  { value: 'm', label: 'M — today’s look' },
  { value: 'l', label: 'L — full curvy UI' },
];

// RFC 0094/0095 — closed, built-in set. Adding a preset here requires it to
// already exist in @sovereignfs/ui's THEME_PRESETS (packages/ui/src/tokens/theme-presets.ts).
const THEME_PRESET_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'neobrutalism', label: 'Neobrutalism' },
];

export function InstanceForm({ initialValues }: { initialValues: InstanceValues }) {
  const [state, action, pending] = useActionState(updateInstanceAction, null);
  useSaveResult(state);
  const [primaryColor, setPrimaryColor] = useState(initialValues.instancePrimary ?? '');
  // The native colour input needs a literal hex for its swatch; when no
  // colour is set yet, mirror the instance's current accent token rather
  // than a hardcoded value (read in an effect — never a browser global in
  // the initializer).
  const [accentDefault, setAccentDefault] = useState('#000000');
  useEffect(() => {
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--sv-color-accent')
      .trim();
    if (/^#[0-9a-fA-F]{6}$/.test(accent)) setAccentDefault(accent);
  }, []);

  const swatchValue = primaryColor.match(/^#[0-9a-fA-F]{6}$/) ? primaryColor : accentDefault;

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
              aria-label="Pick a primary colour"
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

      <FormField
        label="Corner radius"
        id="instanceRadius"
        hint="Scales every rounded corner across the design system. L is large enough that buttons and badges render as full pills."
      >
        {(field) => (
          <Select
            {...field}
            name="instanceRadius"
            defaultValue={initialValues.instanceRadius ?? ''}
          >
            {RADIUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </FormField>

      <FormField
        label="Theme"
        id="instanceThemePreset"
        hint="A closed, built-in set of full visual identities — border width, shadow shape, and corner radius all move together. Your primary colour and corner radius above still take precedence over the preset's own defaults."
      >
        {(field) => (
          <Select
            {...field}
            name="instanceThemePreset"
            defaultValue={initialValues.instanceThemePreset ?? ''}
          >
            {THEME_PRESET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
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
      <div className={styles.fieldStack}>
        <Label htmlFor={fileId}>{dark ? 'Logo (dark theme)' : 'Logo (light theme)'}</Label>
        <ImageDropzone
          accept="image/png,image/svg+xml,image/jpeg,image/webp"
          hint="PNG, SVG, JPEG, or WebP · max 2 MB"
          ariaLabel={dark ? 'Dark theme logo file' : 'Light theme logo file'}
          disabled={pending}
        />
      </div>
      <Feedback result={state} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Uploading…' : 'Upload'}
      </Button>
    </form>
  );
}

export function FaviconUploadForm() {
  const [state, action, pending] = useActionState(uploadFaviconAction, null);
  useSaveResult(state);
  return (
    <form action={action} className={styles.settingsForm}>
      <div className={styles.fieldStack}>
        <Label htmlFor="faviconFile">Favicon</Label>
        <ImageDropzone
          accept="image/png,image/svg+xml,image/x-icon,image/webp"
          hint="PNG, SVG, ICO, or WebP · max 2 MB"
          ariaLabel="Favicon file"
          disabled={pending}
        />
      </div>
      <Feedback result={state} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Uploading…' : 'Upload'}
      </Button>
    </form>
  );
}

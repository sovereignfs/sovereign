'use client';

import Link from 'next/link';
import { startTransition, useActionState, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Collapsible,
  CopyButton,
  FormField,
  Input,
  Select,
  Textarea,
} from '@sovereignfs/ui';
import { SCOPE_TEXT } from '../../../src/clients/form';
import type { ClientView } from '../../../src/clients/registry';
import { registerAppAction, updateAppAction, type AppFormResult } from './actions';
import styles from './apps.module.css';
import { SecretBox } from './secret-box';

const SCOPES = ['openid', 'profile', 'email', 'roles', 'directory', 'offline_access'];

/** What a new app starts as: the scopes most apps want, shown in the launcher, nothing trusted. */
export const NEW_APP: Pick<
  ClientView,
  | 'name'
  | 'type'
  | 'redirectUris'
  | 'postLogoutRedirectUris'
  | 'backchannelLogoutUri'
  | 'endSession'
  | 'scopes'
  | 'trusted'
  | 'launcher'
> = {
  name: '',
  type: 'confidential',
  redirectUris: [],
  postLogoutRedirectUris: [],
  backchannelLogoutUri: undefined,
  endSession: false,
  scopes: ['openid', 'profile', 'email'],
  trusted: false,
  launcher: { description: undefined, icon: undefined, launchUrl: undefined, show: true },
};

type Initial = typeof NEW_APP;

/**
 * Adds an app, or changes one. Every field is held here, so a refusal leaves what was typed and each thing wrong is
 * shown beside its field. The settings an app author needs (logout notices, scopes, trust) are under "Technical
 * settings"; "client" is a word that appears only there.
 */
export function AppForm({ id, initial }: { id?: string; initial: Initial }) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.launcher.description ?? '');
  const [launchUrl, setLaunchUrl] = useState(initial.launcher.launchUrl ?? '');
  const [icon, setIcon] = useState(initial.launcher.icon ?? '');
  const [show, setShow] = useState(initial.launcher.show);
  const [type, setType] = useState<string>(initial.type);
  const [redirectUris, setRedirectUris] = useState(initial.redirectUris.join('\n'));
  const [postLogout, setPostLogout] = useState(initial.postLogoutRedirectUris.join('\n'));
  const [backchannel, setBackchannel] = useState(initial.backchannelLogoutUri ?? '');
  const [endSession, setEndSession] = useState(initial.endSession);
  const [scopes, setScopes] = useState(new Set(initial.scopes));
  const [trusted, setTrusted] = useState(initial.trusted);
  const [open, setOpen] = useState(false);

  const [state, act, pending] = useActionState<AppFormResult | null, FormData>(
    id === undefined ? registerAppAction : updateAppAction.bind(null, id),
    null,
  );
  const fields = state && !state.ok ? state.fields : {};
  const created = state?.ok === true && state.id !== undefined ? state : undefined;

  const toggleScope = (scope: string, on: boolean) =>
    setScopes((before) => {
      const next = new Set(before);
      if (on) next.add(scope);
      else next.delete(scope);
      return next;
    });
  const changeTrust = (on: boolean) => {
    setTrusted(on);
    // Without trust an app cannot be given the role scope.
    if (!on) toggleScope('roles', false);
  };

  if (created) {
    return (
      <div className={styles.form}>
        <Alert variant="success">{created.message}</Alert>
        {created.secret ? (
          <SecretBox
            secret={created.secret}
            message="This is the app’s secret. Put it in the app’s settings now. We keep only a scrambled copy, so we cannot show it again."
          />
        ) : null}
        <p className={styles.hint}>
          The app’s ID is <code className={styles.code}>{created.id}</code>{' '}
          <CopyButton text={created.id ?? ''} label="Copy ID" />
        </p>
        <div className={styles.buttons}>
          <Link className={styles.link} href={`/console/apps/${created.id}`}>
            Open the app
          </Link>
          <Link className={styles.link} href="/console/apps">
            Back to apps
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        // A form action would reset the boxes when it finished, undoing what a refusal should leave.
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => act(data));
      }}
    >
      <FormField label="Name" required error={fields.name}>
        {(field) => (
          <Input
            {...field}
            name="name"
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </FormField>
      <FormField
        label="Description"
        hint="A line about what it is, shown in the launcher."
        error={fields.description}
      >
        {(field) => (
          <Input
            {...field}
            name="description"
            maxLength={280}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        )}
      </FormField>
      <FormField
        label="Launch address"
        hint="Where the launcher sends people to open the app."
        error={fields.launchUrl}
      >
        {(field) => (
          <Input
            {...field}
            name="launchUrl"
            inputMode="url"
            placeholder="https://app.example.com"
            value={launchUrl}
            onChange={(event) => setLaunchUrl(event.target.value)}
          />
        )}
      </FormField>
      <FormField
        label="Icon address"
        hint="A picture for the launcher. Without one, a letter is drawn from the name."
        error={fields.icon}
      >
        {(field) => (
          <Input
            {...field}
            name="icon"
            inputMode="url"
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
          />
        )}
      </FormField>
      <Checkbox name="show" label="Show in the launcher" checked={show} onChange={setShow} />

      <h2 className={styles.subheading}>Signing in</h2>
      <FormField
        label="Sign-in addresses"
        required
        hint="One per line. After signing in, people are sent back to one of these, exactly as written."
        error={fields.redirectUris}
      >
        {(field) => (
          <Textarea
            {...field}
            name="redirectUris"
            rows={3}
            placeholder="https://app.example.com/auth/callback"
            value={redirectUris}
            onChange={(event) => setRedirectUris(event.target.value)}
          />
        )}
      </FormField>
      {id === undefined ? (
        <FormField
          label="Kind of app"
          hint="A server-side app keeps a secret. An app that runs only in the browser or on a phone cannot keep one. This cannot be changed later."
          error={fields.type}
        >
          {(field) => (
            <Select {...field} name="type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="confidential">Has a server that can keep a secret</option>
              <option value="public">Runs only in the browser or on a device</option>
            </Select>
          )}
        </FormField>
      ) : null}

      <Collapsible
        open={open}
        onOpenChange={setOpen}
        trigger="Technical settings, for the people who build the app"
      >
        <div className={styles.technical}>
          <FormField
            label="Addresses after sign-out"
            hint="One per line. The only places core sends people back to after the app asks it to sign them out."
            error={fields.postLogoutRedirectUris}
          >
            {(field) => (
              <Textarea
                {...field}
                name="postLogoutRedirectUris"
                rows={2}
                value={postLogout}
                onChange={(event) => setPostLogout(event.target.value)}
              />
            )}
          </FormField>
          <FormField
            label="Back-channel logout address"
            hint="Core calls this with a signed logout notice when a person’s session ends or their account is deactivated, so the app can end its own session for them."
            error={fields.backchannelLogoutUri}
          >
            {(field) => (
              <Input
                {...field}
                name="backchannelLogoutUri"
                inputMode="url"
                value={backchannel}
                onChange={(event) => setBackchannel(event.target.value)}
              />
            )}
          </FormField>
          <Checkbox
            name="endSession"
            label="Let the app send people to core’s sign-out"
            checked={endSession || postLogout.trim() !== '' || backchannel.trim() !== ''}
            disabled={postLogout.trim() !== '' || backchannel.trim() !== ''}
            onChange={setEndSession}
          />
          <fieldset className={styles.scopes}>
            <legend className={styles.legend}>What the app may ask to see</legend>
            {SCOPES.map((scope) => {
              const text = SCOPE_TEXT[scope];
              if (!text) return null;
              const locked = text.locked === true;
              const needsTrust = scope === 'roles' && !trusted;
              return (
                <div key={scope} className={styles.scope}>
                  {locked ? <input type="hidden" name="scope" value={scope} /> : null}
                  <Checkbox
                    id={`scope-${scope}`}
                    {...(locked ? {} : { name: 'scope', value: scope })}
                    label={`${text.label} (${scope})`}
                    checked={locked || scopes.has(scope)}
                    disabled={locked || needsTrust}
                    onChange={(on) => toggleScope(scope, on)}
                  />
                  <span className={styles.hint}>{text.description}</span>
                </div>
              );
            })}
            {fields.scope ? <p className={styles.error}>{fields.scope}</p> : null}
          </fieldset>
          <Checkbox
            name="trusted"
            label="Trust this app"
            checked={trusted}
            onChange={changeTrust}
          />
          <p className={styles.hint}>
            A trusted app is one you run or vouch for: people are not asked to agree before it signs
            them in, and it may be given their role. Leave this off for anyone else’s app.
          </p>
        </div>
      </Collapsible>

      {state && !state.ok ? <Alert variant="error">{state.error}</Alert> : null}
      {state?.ok && id !== undefined ? <Alert variant="success">{state.message}</Alert> : null}
      <div className={styles.buttons}>
        <Button type="submit" loading={pending}>
          {pending ? 'Saving…' : id === undefined ? 'Add the app' : 'Save changes'}
        </Button>
        <Link className={styles.link} href="/console/apps">
          {id === undefined ? 'Cancel' : 'Back to apps'}
        </Link>
      </div>
    </form>
  );
}

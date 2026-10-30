import type { RegisterInput, UpdateInput } from './registry';

/**
 * What each scope means to the operator who allows it (core-app §3.6.2, §3.7.1). The names in the protocol stay
 * in the technical settings; the words say what an app can learn or do.
 */
export const SCOPE_TEXT: Record<string, { label: string; description: string; locked?: boolean }> =
  {
    openid: {
      label: 'Sign people in',
      description: 'Know who someone is. Every app needs this.',
      locked: true,
    },
    profile: {
      label: 'Name and picture',
      description: 'See their name, picture, language and time zone.',
    },
    email: {
      label: 'Email address',
      description: 'See their email address and whether it is verified.',
    },
    roles: {
      label: 'Their role here',
      description: 'See whether they are an admin or the owner. Only for an app you trust.',
    },
    directory: {
      label: 'Look people up',
      description:
        'Find other accounts on this instance, for example to share something with them.',
    },
    notifications: {
      label: 'Manage its notifications',
      description: 'Read, mark read and clear the notifications it sent them.',
    },
    offline_access: {
      label: 'Stay signed in',
      description: 'Keep working for them when they are not there, until they take access away.',
    },
  };

/**
 * What each thing an app may do for itself means to the operator who allows it (core-app §3.6.6, §3.7.1). No person is asked
 * about these, so the words say what the app can do with nobody there.
 */
export const APP_SCOPE_TEXT: Record<string, { label: string; description: string }> = {
  'notifications:send': {
    label: 'Send notifications',
    description: 'Tell a person who uses the app something, on its own, when nobody is there.',
  },
  'email:send': {
    label: 'Send email',
    description:
      'Email a person who uses the app, from this instance, without being given their address.',
  },
};

/** Lines of text as a list: trimmed, empty lines dropped. A blank box is no addresses. */
export function lines(value: FormDataEntryValue | null): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

const text = (value: FormDataEntryValue | null): string => (typeof value === 'string' ? value : '');
const on = (value: FormDataEntryValue | null): boolean => value === 'on';

/**
 * The settings an operator's form sends, as the registry takes them. Every field the form has is sent, so a
 * save sets the app to what the form showed; a box that is not ticked is off, and an empty box is cleared.
 * What the values may be is decided by the registry, which says everything wrong at once.
 */
export function appFromForm(form: FormData): UpdateInput & { name: string } {
  return {
    name: text(form.get('name')),
    redirectUris: lines(form.get('redirectUris')),
    postLogoutRedirectUris: lines(form.get('postLogoutRedirectUris')),
    backchannelLogoutUri: text(form.get('backchannelLogoutUri')).trim(),
    endSession: on(form.get('endSession')),
    scopes: form.getAll('scope').map(String),
    // Only a confidential app's form has these boxes; a public app sends none, which is none allowed.
    appScopes: form.getAll('appScope').map(String),
    // Only a confidential app's form has the choice: no field is no change.
    ...(text(form.get('secretIn')) !== ''
      ? { secretIn: text(form.get('secretIn')) as 'header' | 'body' }
      : {}),
    ...(text(form.get('idTokenAlgorithm')) !== ''
      ? { idTokenAlgorithm: text(form.get('idTokenAlgorithm')) as 'EdDSA' | 'RS256' }
      : {}),
    trusted: on(form.get('trusted')),
    launcher: {
      description: text(form.get('description')),
      icon: text(form.get('icon')).trim(),
      launchUrl: text(form.get('launchUrl')).trim(),
      show: on(form.get('show')),
    },
  };
}

/** A new app: the form's settings and whether it keeps a secret. */
export function newAppFromForm(form: FormData): RegisterInput {
  return {
    ...appFromForm(form),
    type: text(form.get('type')) === 'public' ? 'public' : 'confidential',
  };
}

/** What was wrong, by the form field it belongs beside. A message that has no field of its own is general. */
export type FieldProblems = Record<string, string>;

/** The form field each setting is shown in. */
const FIELD_OF: Record<string, string> = {
  name: 'name',
  type: 'type',
  redirectUris: 'redirectUris',
  postLogoutRedirectUris: 'postLogoutRedirectUris',
  backchannelLogoutUri: 'backchannelLogoutUri',
  scopes: 'scope',
  appScopes: 'appScope',
  secretIn: 'secretIn',
  idTokenAlgorithm: 'idTokenAlgorithm',
  trusted: 'trusted',
  endSession: 'endSession',
  'launcher.description': 'description',
  'launcher.icon': 'icon',
  'launcher.launchUrl': 'launchUrl',
  'launcher.show': 'show',
};

const LABEL_OF: Record<string, string> = {
  name: 'The name',
  type: 'The type',
  redirectUris: 'The sign-in addresses',
  postLogoutRedirectUris: 'The addresses after sign-out',
  backchannelLogoutUri: 'The logout notice address',
  scopes: 'What the app may see',
  appScopes: 'What the app may do on its own',
  secretIn: 'How the app sends its secret',
  idTokenAlgorithm: 'How tokens are signed',
  'launcher.description': 'The description',
  'launcher.icon': 'The icon address',
  'launcher.launchUrl': 'The launch address',
};

/** One sentence for each thing wrong, put beside its field: "The name is required." */
export function fieldProblems(
  problems: readonly { field: string; message: string }[],
): FieldProblems {
  const byField: FieldProblems = {};
  for (const { field, message } of problems) {
    const key = FIELD_OF[field] ?? field;
    // "is required" belongs to a subject; "address 2 must be https" and "at least one address is needed" do not.
    const sentence = /^(is|are|must|cannot)\b/.test(message)
      ? `${LABEL_OF[field] ?? 'This'} ${message}.`
      : `${message.charAt(0).toUpperCase()}${message.slice(1)}.`;
    byField[key] = byField[key] ? `${byField[key]} ${sentence}` : sentence;
  }
  return byField;
}

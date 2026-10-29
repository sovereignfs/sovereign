'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '../../../src/auth/authorize';
import { InstanceError } from '../../../src/instance/manage';
import { getInstanceManager } from '../../../src/instance/service';

export type SettingsResult = { ok: true; message: string } | { ok: false; error: string };

/** What an expected refusal says to the operator; anything else is a fault and is thrown. */
function said(error: unknown): SettingsResult {
  if (error instanceof InstanceError) return { ok: false, error: error.message };
  throw error;
}

const text = (value: FormDataEntryValue | null): string => (typeof value === 'string' ? value : '');

const saved = (message: string): SettingsResult => {
  // The name is in every page's title and the Console's header, so every page is stale.
  revalidatePath('/', 'layout');
  return { ok: true, message };
};

/**
 * Each action is a public endpoint whatever the page around it checks, so each asks for its capability
 * itself, first; the manager asks again against the matrix in force. The pictures are set through
 * `/api/console/branding/<kind>`, which makes the same two checks.
 */
export async function saveNameAction(
  _previous: SettingsResult | null,
  form: FormData,
): Promise<SettingsResult> {
  const session = await requireCapability('instance:configure');
  try {
    await (await getInstanceManager()).saveName(session.user, text(form.get('name')));
    return saved('The name is saved.');
  } catch (error) {
    return said(error);
  }
}

export async function resetNameAction(_previous: SettingsResult | null): Promise<SettingsResult> {
  const session = await requireCapability('instance:configure');
  try {
    await (await getInstanceManager()).resetName(session.user);
    return saved('The name is back to the default.');
  } catch (error) {
    return said(error);
  }
}

export async function saveInviteOnlyAction(
  _previous: SettingsResult | null,
  form: FormData,
): Promise<SettingsResult> {
  const session = await requireCapability('instance:configure');
  const value = text(form.get('inviteOnly'));
  if (value !== 'true' && value !== 'false') {
    return { ok: false, error: 'Choose who can sign up.' };
  }
  try {
    await (await getInstanceManager()).saveInviteOnly(session.user, value === 'true');
    return saved(
      value === 'true'
        ? 'Only people you invite can sign up.'
        : 'Anyone can sign up without an invitation.',
    );
  } catch (error) {
    return said(error);
  }
}

export async function resetInviteOnlyAction(
  _previous: SettingsResult | null,
): Promise<SettingsResult> {
  const session = await requireCapability('instance:configure');
  try {
    await (await getInstanceManager()).resetInviteOnly(session.user);
    return saved('Sign-up follows the server’s setting again.');
  } catch (error) {
    return said(error);
  }
}

export async function saveSmtpAction(
  _previous: SettingsResult | null,
  form: FormData,
): Promise<SettingsResult> {
  const session = await requireCapability('instance:configure-secrets');
  try {
    await (
      await getInstanceManager()
    ).saveSmtp(session.user, {
      host: text(form.get('host')),
      port: text(form.get('port')),
      user: text(form.get('user')),
      from: text(form.get('from')),
      password: text(form.get('password')),
      clearPassword: form.get('clearPassword') === 'on',
    });
    return saved('The email settings are saved.');
  } catch (error) {
    return said(error);
  }
}

export async function resetSmtpAction(_previous: SettingsResult | null): Promise<SettingsResult> {
  const session = await requireCapability('instance:configure-secrets');
  try {
    await (await getInstanceManager()).resetSmtp(session.user);
    return saved('Email follows the server’s settings again.');
  } catch (error) {
    return said(error);
  }
}

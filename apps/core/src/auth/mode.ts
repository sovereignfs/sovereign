import { getDatabase } from '../database';
import { getSettings } from '../settings';
import { registrationFrom, registrationMode, type RegistrationMode } from './registration';

/** Who can sign up right now, for the sign-up page to explain. */
export async function getRegistrationMode(): Promise<RegistrationMode> {
  const [database, settings] = await Promise.all([getDatabase(), getSettings()]);
  return registrationMode(database, registrationFrom(settings));
}

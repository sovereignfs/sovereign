import { auth } from '@/lib/auth';
import { keySettings } from '@/lib/keys';
import { Received } from './received';

export const dynamic = 'force-dynamic';

/** The key return address (`encryption.return` in the manifest): core sends the person back here with the app's key, sealed. */
export default async function KeyReturn() {
  await auth().requireSession('/');
  return <Received {...keySettings()} />;
}

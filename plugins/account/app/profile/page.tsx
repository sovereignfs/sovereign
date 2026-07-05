import { headers } from 'next/headers';
import { sdk } from '@sovereignfs/sdk';
import { AvatarUpload } from '../_components/AvatarUpload';
import { DisplayNameForm } from './DisplayNameForm';
import styles from '../account.module.css';

export const dynamic = 'force-dynamic';

const AUTH_URL =
  process.env.SOVEREIGN_AUTH_URL ?? `http://localhost:${process.env.AUTH_PORT ?? '3001'}`;

/**
 * Read the authoritative name/image straight from the auth server (uncached).
 *
 * The runtime-injected session headers come from better-auth's signed
 * `session_data` cache (AUTH-05). After a self-edit the display-name action
 * clears that cache cookie, but the value only refreshes on the *next* request —
 * so re-rendering this page within the same action cycle would still show the
 * old name (the dialog appeared not to update until reopened).
 *
 * `?disableCookieCache=true` is essential: get-session honours the same signed
 * cookie cache by default, so without it this would return the stale name too.
 * The flag forces better-auth to read the user row from the database. Falls back
 * to the cached session if the fetch fails.
 */
async function freshProfile(): Promise<{ name: string | null; image: string | null } | null> {
  const cookie = (await headers()).get('cookie') ?? '';
  try {
    const res = await fetch(`${AUTH_URL}/api/auth/get-session?disableCookieCache=true`, {
      headers: { cookie, origin: AUTH_URL },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      user?: { name?: string | null; image?: string | null };
    } | null;
    return data?.user ? { name: data.user.name ?? null, image: data.user.image ?? null } : null;
  } catch {
    return null;
  }
}

export default async function ProfilePage() {
  const { user } = await sdk.auth.requireSession();
  const fresh = await freshProfile();
  const name = fresh?.name ?? user.name ?? null;
  const image = fresh?.image ?? user.image;

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Avatar</h2>
        <AvatarUpload imageUrl={image} name={name ?? user.email} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Display name</h2>
        <DisplayNameForm initialName={name ?? ''} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Email</h2>
        <p className={styles.readonlyValue}>{user.email}</p>
        <p className={styles.help}>Email changes aren’t supported yet.</p>
      </section>
    </div>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { EmptyState, Button } from '@sovereignfs/ui';
import { getInstalledPlugins } from '@/src/registry';
import styles from './verification-required.module.css';

interface Props {
  params: Promise<{ pluginId: string }>;
  searchParams: Promise<{ level?: string }>;
}

/**
 * Nudge page for the `minVerificationLevel` plugin route gate (RFC 0035
 * §5.8/§5.9, epic task 1.9). `runtime/middleware.ts` redirects here (303)
 * when `decidePluginRoute` returns `'verification-required'`. Message and
 * available self-service action vary by which level is needed — Level 3 has
 * none by design (RFC §5.9: "no self-service path exists").
 */
export default async function VerificationRequiredPage({ params, searchParams }: Props) {
  const { pluginId } = await params;
  const { level } = await searchParams;
  const decodedId = decodeURIComponent(pluginId);
  const requiredLevel = Number(level ?? '1');

  const plugin = getInstalledPlugins().find((p) => p.id === decodedId);
  if (!plugin) redirect('/');

  const appName = plugin.name;

  if (requiredLevel >= 3) {
    return (
      <div className={styles.page}>
        <EmptyState
          icon="lock"
          heading={`Admin approval required for ${appName}`}
          description="Access to this app requires admin approval. Contact your workspace owner."
          action={
            <Link href="/">
              <Button>Go home</Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (requiredLevel >= 2) {
    return (
      <div className={styles.page}>
        <EmptyState
          icon="shield"
          heading={`Enable MFA to access ${appName}`}
          description="This app requires two-factor authentication or a passkey. Enroll one in Account → Security to continue."
          action={
            <Link href="/account/security">
              <Button>Go to Security settings</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <EmptyState
        icon="mail"
        heading={`Verify your email to access ${appName}`}
        description="This app requires a verified email address. Check your inbox for the verification link, or request a new one."
        action={
          <Link href="/verify-email">
            <Button>Go to email verification</Button>
          </Link>
        }
      />
    </div>
  );
}

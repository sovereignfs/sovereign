import { redirect } from 'next/navigation';
import { readServerSession } from '@/src/server-session';
import { RegisterForm } from './register-form';

const AUTH_PUBLIC_URL =
  process.env.SOVEREIGN_AUTH_PUBLIC_URL ??
  process.env.SOVEREIGN_AUTH_URL ??
  'http://localhost:3001';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  // Already signed in? Send them to the app rather than showing the form.
  // (Skipped for invite-token links, handled below.) See readServerSession.
  if (!token && (await readServerSession())) redirect('/');

  // Invite-token registration still goes through the auth server — it needs
  // direct DB access to validate and consume the token. This redirect is
  // intentional: invite links are clicked once from email, not a daily PWA flow.
  if (token) {
    redirect(`${AUTH_PUBLIC_URL}/register?token=${encodeURIComponent(token)}`);
  }

  const instanceName = process.env.INSTANCE_NAME ?? 'Sovereign';
  return <RegisterForm instanceInitial={instanceName[0]?.toUpperCase() ?? 'S'} />;
}

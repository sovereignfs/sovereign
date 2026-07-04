import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { resolveInstanceName } from '@/src/instance-name';
import { readServerSession } from '@/src/server-session';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  // Already signed in? Send them to the app rather than showing the form. The
  // middleware skips this route, so the check lives here (see readServerSession).
  if (await readServerSession()) redirect('/');

  const instanceName = resolveInstanceName(process.env.INSTANCE_NAME);
  return (
    <Suspense>
      <LoginForm
        instanceName={instanceName}
        instanceInitial={instanceName[0]?.toUpperCase() ?? 'S'}
      />
    </Suspense>
  );
}

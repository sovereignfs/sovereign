import { Suspense } from 'react';
import { LoginForm } from './login-form';

export default function LoginPage() {
  const instanceName = process.env.INSTANCE_NAME ?? 'Sovereign';
  return (
    <Suspense>
      <LoginForm
        instanceName={instanceName}
        instanceInitial={instanceName[0]?.toUpperCase() ?? 'S'}
      />
    </Suspense>
  );
}

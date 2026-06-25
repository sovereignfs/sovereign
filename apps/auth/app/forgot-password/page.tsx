import { Suspense } from 'react';
import { ForgotForm } from './forgot-form';

export default function ForgotPasswordPage() {
  const instanceName = process.env.INSTANCE_NAME ?? 'Sovereign';
  const instanceInitial = instanceName[0]?.toUpperCase() ?? 'S';
  return (
    <Suspense>
      <ForgotForm instanceInitial={instanceInitial} />
    </Suspense>
  );
}

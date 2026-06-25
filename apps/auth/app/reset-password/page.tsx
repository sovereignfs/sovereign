import { Suspense } from 'react';
import { ResetForm } from './reset-form';

export default function ResetPasswordPage() {
  const instanceName = process.env.INSTANCE_NAME ?? 'Sovereign';
  const instanceInitial = instanceName[0]?.toUpperCase() ?? 'S';
  return (
    <Suspense>
      <ResetForm instanceInitial={instanceInitial} />
    </Suspense>
  );
}

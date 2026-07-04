import { Suspense } from 'react';
import { resolveInstanceName } from '@/src/instance-name';
import { ResetForm } from './reset-form';

export default function ResetPasswordPage() {
  const instanceName = resolveInstanceName(process.env.INSTANCE_NAME);
  const instanceInitial = instanceName[0]?.toUpperCase() ?? 'S';
  return (
    <Suspense>
      <ResetForm instanceInitial={instanceInitial} />
    </Suspense>
  );
}

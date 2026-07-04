import { Suspense } from 'react';
import { resolveInstanceName } from '@/src/instance-name';
import { ForgotForm } from './forgot-form';

export default function ForgotPasswordPage() {
  const instanceName = resolveInstanceName(process.env.INSTANCE_NAME);
  const instanceInitial = instanceName[0]?.toUpperCase() ?? 'S';
  return (
    <Suspense>
      <ForgotForm instanceInitial={instanceInitial} />
    </Suspense>
  );
}

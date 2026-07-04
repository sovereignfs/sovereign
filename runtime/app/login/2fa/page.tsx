import { Suspense } from 'react';
import { resolveInstanceName } from '@/src/instance-name';
import { ChallengeForm } from './challenge-form';

export default function TwoFactorPage() {
  const instanceName = resolveInstanceName(process.env.INSTANCE_NAME);
  return (
    <Suspense>
      <ChallengeForm instanceInitial={instanceName[0]?.toUpperCase() ?? 'S'} />
    </Suspense>
  );
}

import { Suspense } from 'react';
import { runtimePublicUrl } from '@/src/runtime-url';
import { ChallengeForm } from './challenge-form';

export default function TwoFactorPage() {
  const runtimeUrl = runtimePublicUrl();
  const instanceName = process.env.INSTANCE_NAME ?? 'Sovereign';
  const instanceInitial = instanceName[0]?.toUpperCase() ?? 'S';
  return (
    <Suspense>
      <ChallengeForm runtimeUrl={runtimeUrl} instanceInitial={instanceInitial} />
    </Suspense>
  );
}

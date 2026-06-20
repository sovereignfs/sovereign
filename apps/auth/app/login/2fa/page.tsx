import { Suspense } from 'react';
import { runtimePublicUrl } from '@/src/runtime-url';
import { ChallengeForm } from './challenge-form';

export default function TwoFactorPage() {
  const runtimeUrl = runtimePublicUrl();
  return (
    <Suspense>
      <ChallengeForm runtimeUrl={runtimeUrl} />
    </Suspense>
  );
}

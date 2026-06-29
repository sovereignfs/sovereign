import { Suspense } from 'react';
import { ChallengeForm } from './challenge-form';

export default function TwoFactorPage() {
  const instanceName = process.env.INSTANCE_NAME ?? 'Sovereign';
  return (
    <Suspense>
      <ChallengeForm instanceInitial={instanceName[0]?.toUpperCase() ?? 'S'} />
    </Suspense>
  );
}

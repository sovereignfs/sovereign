import { Suspense } from 'react';
import { runtimePublicUrl } from '@/src/runtime-url';
import { VerifyForm } from './verify-form';

// Server component: resolves the runtime URL at request time and hands it to the
// client form. useSearchParams (in VerifyForm) must sit under a Suspense boundary
// (Next 15).
export default function VerifyEmailPage() {
  const runtimeUrl = runtimePublicUrl();
  const instanceName = process.env.INSTANCE_NAME ?? 'Sovereign';
  return (
    <Suspense>
      <VerifyForm runtimeUrl={runtimeUrl} instanceInitial={instanceName[0]?.toUpperCase() ?? 'S'} />
    </Suspense>
  );
}

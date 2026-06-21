import { Suspense } from 'react';
import { brandName } from '@/src/brand-name';
import { runtimePublicUrl } from '@/src/runtime-url';
import { LoginForm } from './login-form';

// Server component: resolves the runtime URL and brand name at request time.
// useSearchParams (in LoginForm) must sit under a Suspense boundary (Next 15).
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm runtimeUrl={runtimePublicUrl()} brandName={brandName()} />
    </Suspense>
  );
}

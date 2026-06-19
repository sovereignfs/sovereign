import { Suspense } from 'react';
import { runtimePublicUrl } from '@/src/runtime-url';
import { LoginForm } from './login-form';

// Server component: resolves the runtime URL at request time and hands it to the
// client form. useSearchParams (in LoginForm) must sit under a Suspense boundary
// (Next 15).
export default function LoginPage() {
  const runtimeUrl = runtimePublicUrl();
  return (
    <Suspense>
      <LoginForm runtimeUrl={runtimeUrl} />
    </Suspense>
  );
}

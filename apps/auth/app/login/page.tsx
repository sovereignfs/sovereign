import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getEmailBranding } from '@/src/email-branding';
import { runtimePublicUrl } from '@/src/runtime-url';
import { LoginForm } from './login-form';

// RFC 0027 Phase 2 — same instance-branding source as the password reset
// email (getEmailBranding), reused here for this app's own compatibility
// login page (used by the OAuth provider's login flow; the primary sign-in
// UI lives on the runtime — see runtime/app/login/page.tsx).
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getEmailBranding();
  return { title: `Sign in to ${branding.name}` };
}

// Server component: resolves the runtime URL at request time and hands it to the
// client form. useSearchParams (in LoginForm) must sit under a Suspense boundary
// (Next 15).
export default async function LoginPage() {
  const runtimeUrl = runtimePublicUrl();
  const branding = await getEmailBranding();
  return (
    <Suspense>
      <LoginForm
        runtimeUrl={runtimeUrl}
        instanceName={branding.name}
        instanceInitial={branding.name[0]?.toUpperCase() ?? 'S'}
        instanceLogoUrl={branding.logoUrl ?? null}
      />
    </Suspense>
  );
}

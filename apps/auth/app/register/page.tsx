import { runtimePublicUrl } from '@/src/runtime-url';
import { RegisterForm } from './register-form';

// Server component: resolves the runtime URL at request time and hands it to the
// client form (so the post-registration redirect uses the deployment's real
// runtime origin, not a build-time-frozen value).
export default function RegisterPage() {
  return <RegisterForm runtimeUrl={runtimePublicUrl()} />;
}

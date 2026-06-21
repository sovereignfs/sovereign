import { Suspense } from 'react';
import { ForgotForm } from './forgot-form';

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotForm />
    </Suspense>
  );
}

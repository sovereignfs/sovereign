import { redirect } from 'next/navigation';

// Auth server no longer serves UI; redirect to the runtime (actual end-user UI).
export default function Home() {
  const runtimeUrl =
    process.env.SOVEREIGN_RUNTIME_URL ?? `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;
  redirect(runtimeUrl);
}

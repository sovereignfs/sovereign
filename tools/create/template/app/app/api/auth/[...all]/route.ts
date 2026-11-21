// The sign-in's routes (better-auth on `@sovereignfs/auth`), and signing in through core: /api/auth/sign-in/sovereign and
// /api/auth/callback/sovereign, the address in sovereign.manifest.json.
import { signIn } from '@/lib/sign-in';

export const dynamic = 'force-dynamic';

const handle = async (request: Request) => (await signIn()).auth.handler(request);

export const GET = handle;
export const POST = handle;

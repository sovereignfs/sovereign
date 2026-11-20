// /auth/login, /auth/callback, /auth/logout, /auth/backchannel-logout and /auth/account-deleted: the addresses in sovereign.manifest.json.
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => auth().handlers.GET(request);
export const POST = (request: Request) => auth().handlers.POST(request);

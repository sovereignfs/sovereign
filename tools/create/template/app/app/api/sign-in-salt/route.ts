// The salt a page derives the sign-in value with (auth.md §4, rule 1): the vault id, made once (sdk §9.5). It is no secret.
import { signIn } from '@/lib/sign-in';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { vault } = await signIn();
  return Response.json({ vaultId: await vault.vaultId() });
}

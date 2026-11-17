import { isReleaseState, publicKeyFrom } from '@sovereignfs/crypto/web';
import type { Auth } from '../auth/auth';
import { clientView, type ClientRow } from '../clients/registry';

/**
 * What core's key release page may act on (core-app §5.7, RFC 0005 §4 step 2): an app that exists, is switched on and may use
 * encryption, asking with exactly the return address registered for it, a public key and a `state`. Anything else is `undefined`,
 * and the page answers with the page that is not there, the same for every way of being wrong.
 */
export interface ReleaseTargetView {
  readonly clientId: string;
  readonly appName: string;
  readonly returnTo: string;
  readonly request: string;
  readonly state: string;
}

const one = (value: string | string[] | undefined): string | undefined =>
  typeof value === 'string' && value.length > 0 && value.length <= 2048 ? value : undefined;

export async function readReleaseTarget(
  auth: Pick<Auth, '$context'>,
  query: Record<string, string | string[] | undefined>,
): Promise<ReleaseTargetView | undefined> {
  const clientId = one(query.client_id);
  const returnTo = one(query.return_to);
  const request = one(query.request);
  const state = one(query.state);
  if (!clientId || !returnTo || !request || !isReleaseState(state)) return undefined;
  try {
    publicKeyFrom(request);
  } catch {
    return undefined;
  }
  const row = await (
    await auth.$context
  ).adapter.findOne<ClientRow>({
    model: 'oauthClient',
    where: [{ field: 'clientId', value: clientId }],
  });
  if (!row) return undefined;
  const view = clientView(row);
  // Exactly the registered address: the answer goes nowhere else, so an app gets its own key and no other.
  if (!view.enabled || view.keyReturnUri === undefined || view.keyReturnUri !== returnTo) {
    return undefined;
  }
  return { clientId, appName: view.name, returnTo, request, state };
}

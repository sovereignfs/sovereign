// The route a device turns notifications on and off with (@sovereignfs/push): the signed-in account's devices only, from this app's
// own pages only (the Origin check), and nothing of it cached.
import { pushSubscriptionHandlers } from '@sovereignfs/push';
import { currentAccount } from '@/lib/account';
import { setting } from '@/lib/config';
import { originOf } from '@/lib/csp';
import { appPush, pushStore } from '@/lib/push';

export const dynamic = 'force-dynamic';

const handlers = () => {
  const origin = originOf(setting('__PREFIX___URL'));
  return pushSubscriptionHandlers({
    store: pushStore(),
    settings: appPush(),
    account: () => currentAccount(),
    ...(origin ? { origin } : {}),
  });
};

export const GET = (request: Request) => handlers().GET(request);
export const POST = (request: Request) => handlers().POST(request);
export const DELETE = (request: Request) => handlers().DELETE(request);

import { required } from './config';

/**
 * What the page needs to get the app's key from core (sdk §9.3): core's address, the app's client id, and the key return address as
 * registered, absolute. Read on the server for each request and handed to the page, never built into the bundle.
 */
export function keySettings() {
  const app = required('__PREFIX___URL').replace(/\/+$/, '');
  return {
    core: required('__PREFIX___CORE_URL'),
    clientId: required('__PREFIX___CORE_CLIENT_ID'),
    returnTo: `${app}/keys/return`,
  };
}

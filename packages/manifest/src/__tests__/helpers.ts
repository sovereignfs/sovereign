import type { Manifest } from '../types';

/** A valid manifest 1, as the app template has it, with what a test changes laid over it. */
export function manifestOf(change: Record<string, unknown> = {}): Manifest {
  return {
    manifest: 1,
    prefix: 'NOTES',
    name: 'Notes',
    description: 'Notes for the whole household',
    port: 3000,
    health: '/api/health',
    launch: '/',
    signIn: {
      redirect: ['/auth/callback'],
      postLogout: ['/'],
      backChannel: '/auth/backchannel-logout',
      accountDeleted: '/auth/account-deleted',
      scopes: ['openid', 'profile', 'email', 'offline_access'],
    },
    database: { pooling: 'transaction' },
    generate: ['NOTES_AUTH_SECRET'],
    core: '>=0.49.0 <1.0.0',
    ...change,
  } as Manifest;
}

/** A valid manifest 2, as Fjord Web would write it: a lower-case prefix, signed in through core, one secret larger than the rest. */
export function manifest2Of(change: Record<string, unknown> = {}): Manifest {
  return {
    manifest: 2,
    prefix: 'fjord',
    name: 'Fjord',
    port: 3000,
    health: '/api/health',
    signIn: { redirect: ['/api/auth/callback/sovereign'], scopes: ['openid', 'profile', 'email'] },
    database: true,
    generate: ['FJORD_AUTH_SECRET', { name: 'FJORD_ENCRYPTION_KEY', bytes: 32 }],
    core: '>=0.57.0 <1.0.0',
    ...change,
  } as Manifest;
}

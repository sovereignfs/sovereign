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

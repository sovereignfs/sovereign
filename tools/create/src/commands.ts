/**
 * The words of the commands an app's repository runs (`npm create @sovereignfs app sync`, `app release check`, …). They cannot name an
 * app, so `app sync` is never read as making an app called sync.
 */
export const TOOL_COMMANDS = ['release', 'commits', 'sync', 'settings'] as const;

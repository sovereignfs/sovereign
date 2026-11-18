import { manifest } from '@sovereignfs/pwa';

/**
 * What a browser reads to install __TITLE__ (`@sovereignfs/pwa`): a window of its own, the icons in `app/pwa-icon`, and what lets an
 * installed core open the installed app rather than a browser view. Its id is the start address: never change it once people have
 * installed the app, or each install becomes another app.
 */
export default function webManifest() {
  return manifest({
    name: '__TITLE__',
    description: 'Notes, as a starting point for an app on a Sovereign instance',
  });
}

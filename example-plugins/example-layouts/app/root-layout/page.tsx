import { RootLayoutDemo } from './_components/RootLayoutDemo';

/**
 * Example: RootLayout — reference plugin demonstrating @sovereignfs/ui's
 * RootLayout: the root-level layout a plugin's page tree sits in. Pick a
 * variant below, then resize the browser window below 768px to see the
 * mobile fork — each variant is a fixed web+mobile pairing (not two
 * independently-selectable axes), so 'sidebar' drops its sidebar on mobile
 * and 'shell' only shows its header/footer on mobile.
 */
export default function RootLayoutExamplePage() {
  return <RootLayoutDemo />;
}

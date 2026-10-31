/** @type {import('next').NextConfig} */
export default {
  // One self-contained server in .next/standalone: what the image runs (see the Dockerfile).
  output: 'standalone',
  // The database driver is loaded by the server and not bundled into it.
  serverExternalPackages: ['pg'],
  poweredByHeader: false,
};

/** @type {import('next').NextConfig} */
export default {
  // One self-contained server in .next/standalone: what the image runs (see the Dockerfile).
  output: 'standalone',
  // The database drivers are loaded by the server and not bundled into it: pg for PostgreSQL, libsql for a SQLite file and sqld.
  serverExternalPackages: ['pg', '@libsql/client', 'libsql'],
  poweredByHeader: false,
};

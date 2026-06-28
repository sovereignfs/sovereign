import { defineConfig } from 'vitepress';

export default defineConfig({
  srcDir: '../../docs',
  outDir: '.vitepress/dist',
  srcExclude: ['rfcs/TEMPLATE.md'],
  // Existing docs link to root-level files (CONTRIBUTING, SECURITY, CLAUDE.md)
  // and localhost dev URLs — none of which are part of the built site.
  ignoreDeadLinks: true,
  vite: {
    resolve: {
      dedupe: ['vue'],
    },
  },
  title: 'Sovereign',
  description: 'Self-hostable, privacy-first workspace runtime',

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/self-hosting' },
      { text: 'Plugin Dev', link: '/plugin-development' },
      { text: 'Design System', link: '/design-system' },
      { text: 'RFCs', link: '/rfcs/0001-overlay-shell-variant' },
      { text: 'GitHub', link: 'https://github.com/sovereignfs/sovereign' },
    ],

    sidebar: {
      '/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Self-Hosting', link: '/self-hosting' },
            { text: 'Architecture', link: '/architecture' },
            { text: 'Security', link: '/security' },
            { text: 'Upgrade Guide', link: '/upgrade' },
            { text: 'Troubleshooting', link: '/troubleshooting' },
          ],
        },
        {
          text: 'Plugin Development',
          items: [
            { text: 'Overview', link: '/plugin-development' },
            { text: 'SDK Stability', link: '/sdk-stability' },
            { text: 'Plugin Database', link: '/plugin-database' },
            { text: 'Design System', link: '/design-system' },
          ],
        },
        {
          text: 'Core Plugins',
          items: [
            { text: 'Console', link: '/plugins/console' },
            { text: 'Launcher', link: '/plugins/launcher' },
            { text: 'Account', link: '/plugins/account' },
          ],
        },
        {
          text: 'Contributing',
          items: [
            { text: 'Development Workflow', link: '/development-workflow' },
            { text: 'Architecture Rules', link: '/architecture-rules' },
            { text: 'Testing E2E', link: '/testing-e2e' },
            { text: 'Roadmap', link: '/roadmap' },
          ],
        },
        {
          text: 'RFCs',
          collapsed: true,
          items: [
            { text: 'RFC 0001 — Overlay Shell', link: '/rfcs/0001-overlay-shell-variant' },
            {
              text: 'RFC 0002 — Cross-Plugin Data Sharing',
              link: '/rfcs/0002-cross-plugin-data-sharing',
            },
            { text: 'RFC 0003 — Plugin Monetization', link: '/rfcs/0003-plugin-monetization' },
            { text: 'RFC 0004 — Per-Plugin Database', link: '/rfcs/0004-per-plugin-database' },
            { text: 'RFC 0005 — Activity Log', link: '/rfcs/0005-activity-log' },
            {
              text: 'RFC 0006 — Deployment & Upgrade',
              link: '/rfcs/0006-deployment-upgrade-strategy',
            },
            {
              text: 'RFC 0007 — User Data Portability',
              link: '/rfcs/0007-user-data-portability',
            },
            {
              text: 'RFC 0008 — Security & Encryption',
              link: '/rfcs/0008-security-encryption-architecture',
            },
            {
              text: 'RFC 0009 — Internal Package Codenames',
              link: '/rfcs/0009-internal-package-codenames',
            },
            { text: 'RFC 0010 — Test Organization', link: '/rfcs/0010-test-organization' },
          ],
        },
      ],
    },

    search: { provider: 'local' },

    socialLinks: [{ icon: 'github', link: 'https://github.com/sovereignfs/sovereign' }],
  },
});

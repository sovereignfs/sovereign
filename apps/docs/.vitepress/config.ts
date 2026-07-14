import { defineConfig } from 'vitepress';
import { getPrivateDocumentPaths, isPublicDocument, publicGuideRewrites } from './publication';

const rfcSidebarItems = [
  { text: 'RFC Index', link: '/rfcs/README' },
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
  { text: 'RFC 0011 — Icon System', link: '/rfcs/0011-icon-system' },
  { text: 'RFC 0012 — Passkeys & MFA', link: '/rfcs/0012-passkeys-and-mfa' },
  { text: 'RFC 0013 — Mobile & PWA', link: '/rfcs/0013-mobile-responsiveness-pwa' },
  { text: 'RFC 0014 — Minimal Shell Mode', link: '/rfcs/0014-minimal-shell-mode' },
  { text: 'RFC 0015 — Notification Center', link: '/rfcs/0015-notification-center' },
  { text: 'RFC 0016 — Web Push', link: '/rfcs/0016-web-push' },
  {
    text: 'RFC 0017 — Plugin Starter & Examples',
    link: '/rfcs/0017-plugin-starter-and-examples',
  },
  { text: 'RFC 0018 — Plugin-Scoped Env', link: '/rfcs/0018-plugin-scoped-env' },
  { text: 'RFC 0019 — Test Setup & Seeding', link: '/rfcs/0019-test-setup-and-seeding' },
  { text: 'RFC 0020 — Production Dev Mode', link: '/rfcs/0020-production-dev-mode' },
  {
    text: 'RFC 0021 — Platform Roles & Capabilities',
    link: '/rfcs/0021-platform-roles-and-capabilities',
  },
  { text: 'RFC 0022 — Plugin Capabilities', link: '/rfcs/0022-plugin-capabilities' },
  { text: 'RFC 0023 — SDK Distribution', link: '/rfcs/0023-sdk-distribution' },
  { text: 'RFC 0024 — Plugin Compatibility', link: '/rfcs/0024-plugin-compatibility' },
  { text: 'RFC 0025 — Accessibility', link: '/rfcs/0025-accessibility' },
  { text: 'RFC 0026 — Non-Docker Deployment', link: '/rfcs/0026-non-docker-deployment' },
  { text: 'RFC 0027 — White-Labeling', link: '/rfcs/0027-white-labeling' },
  { text: 'RFC 0028 — Operator Fork Model', link: '/rfcs/0028-operator-fork-model' },
  { text: 'RFC 0029 — Internationalization', link: '/rfcs/0029-internationalization' },
  {
    text: 'RFC 0030 — Privacy-First Analytics',
    link: '/rfcs/0030-privacy-first-analytics',
  },
  { text: 'RFC 0031 — Email Templates', link: '/rfcs/0031-email-templates' },
  {
    text: 'RFC 0032 — Instance Identity Rename',
    link: '/rfcs/0032-instance-identity-rename',
  },
  { text: 'RFC 0033 — User Data Deletion', link: '/rfcs/0033-user-data-deletion' },
  {
    text: 'RFC 0034 — Notification Transport',
    link: '/rfcs/0034-notification-transport',
  },
  {
    text: 'RFC 0035 — Progressive User Verification',
    link: '/rfcs/0035-progressive-user-verification',
  },
  { text: 'RFC 0036 — Per-Plugin Dialect', link: '/rfcs/0036-per-plugin-dialect' },
  { text: 'RFC 0037 — VitePress Docs Site', link: '/rfcs/0037-vitepress-docs-site' },
  { text: 'RFC 0038 — Desktop App Shell', link: '/rfcs/0038-desktop-app-shell' },
  {
    text: 'RFC 0039 — Instance ID & Terminology',
    link: '/rfcs/0039-instance-id-and-terminology',
  },
  { text: 'RFC 0040 — Sovereign Harness', link: '/rfcs/0040-sovereign-harness' },
  { text: 'RFC 0041 — User Directory', link: '/rfcs/0041-user-directory' },
  { text: 'RFC 0042 — Public Plugin Routes', link: '/rfcs/0042-public-plugin-routes' },
  { text: 'RFC 0043 — Plugin Secret Vault', link: '/rfcs/0043-plugin-secret-vault' },
  { text: 'RFC 0044 — Plugin Storage', link: '/rfcs/0044-plugin-storage' },
  { text: 'RFC 0045 — Plugin Events', link: '/rfcs/0045-plugin-events' },
  { text: 'RFC 0046 — Plugin Jobs', link: '/rfcs/0046-plugin-jobs' },
  { text: 'RFC 0047 — Plugin Tools', link: '/rfcs/0047-plugin-tools' },
  {
    text: 'RFC 0048 — Messages & Notification Detail',
    link: '/rfcs/0048-messages-and-notification-detail',
  },
  {
    text: 'RFC 0049 — External Connections',
    link: '/rfcs/0049-plugin-external-connections',
  },
  { text: 'RFC 0050 — Public Plugin Webhooks', link: '/rfcs/0050-public-plugin-webhooks' },
  {
    text: 'RFC 0051 — Cross-Plugin References',
    link: '/rfcs/0051-cross-plugin-references',
  },
  {
    text: 'RFC 0052 — Plugin Portability Hooks',
    link: '/rfcs/0052-plugin-portability-hooks',
  },
  { text: 'RFC 0053 — Plugin Flow Handoffs', link: '/rfcs/0053-plugin-flow-handoffs' },
  {
    text: 'RFC 0054 — Plugin-Scoped Roles & Grants',
    link: '/rfcs/0054-plugin-scoped-roles-and-grants',
  },
  { text: 'RFC 0055 — Sovereign Council', link: '/rfcs/0055-sovereign-council' },
  { text: 'RFC 0056 — Sovereign Guide', link: '/rfcs/0056-sovereign-guide' },
  { text: 'RFC 0057 — Plugin Dependency Hoisting', link: '/rfcs/0057-plugin-dep-hoisting' },
  {
    text: 'RFC 0058 — Native Mobile App Shell',
    link: '/rfcs/0058-native-mobile-app-shell',
  },
  {
    text: 'RFC 0059 — Local Visual Regression',
    link: '/rfcs/0059-local-visual-regression-testing',
  },
  {
    text: 'RFC 0060 — Client-Side Encryption',
    link: '/rfcs/0060-client-side-encryption-core',
  },
  { text: 'RFC 0061 — Sovereign Wallet', link: '/rfcs/0061-sovereign-wallet' },
  {
    text: 'RFC 0062 — Email Delivery Coverage',
    link: '/rfcs/0062-email-delivery-coverage',
  },
  {
    text: 'RFC 0063 — Core Assistant',
    link: '/rfcs/0063-core-assistant-jarvis',
  },
  {
    text: 'RFC 0064 — Git-Backed Operator Backups',
    link: '/rfcs/0064-git-backed-operator-backups',
  },
  {
    text: 'RFC 0065 — User Groups and Plugin Access',
    link: '/rfcs/0065-user-groups-plugin-access',
  },
  {
    text: 'RFC 0066 — Sovereign Chat P2P Identity',
    link: '/rfcs/0066-sovereign-chat-p2p-identity',
  },
  {
    text: 'RFC 0067 — Product-Led Docs Site',
    link: '/rfcs/0067-product-led-docs-site',
  },
];

const productSidebarItems = [
  { text: 'What is Sovereign?', link: '/product/' },
  { text: 'Why Sovereign?', link: '/product/why-sovereign' },
  { text: 'How It Works', link: '/product/how-it-works' },
  { text: 'Features', link: '/product/features' },
  { text: 'Apps', link: '/product/apps' },
];

const gettingStartedSidebarItems = [
  { text: 'Choose a Path', link: '/get-started/' },
  { text: 'Use Sovereign', link: '/get-started/users' },
  { text: 'Host Sovereign', link: '/get-started/operators' },
  { text: 'Build an App', link: '/get-started/developers' },
];

const docsHubSidebarItems = [
  { text: 'Documentation Home', link: '/docs/' },
  { text: 'Use Sovereign', link: '/docs/users' },
  { text: 'Install as an App', link: '/docs/pwa' },
  { text: 'Operate Sovereign', link: '/docs/operators' },
  { text: 'Build Apps', link: '/docs/developers' },
  { text: 'Architecture & Security', link: '/docs/architecture' },
  { text: 'Contribute', link: '/docs/contributing' },
];

export default defineConfig({
  srcDir: '../../docs',
  outDir: '.vitepress/dist',
  rewrites: publicGuideRewrites,
  srcExclude: getPrivateDocumentPaths(),
  transformPageData(pageData) {
    const sourcePath = pageData.filePath || pageData.relativePath;
    if (!isPublicDocument(sourcePath)) {
      pageData.isNotFound = true;
      pageData.title = 'Page not found';
      pageData.description = '';
    }
  },
  vite: {
    plugins: [
      {
        name: 'sovereign-canonical-guide-routes',
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            const requestUrl = request.url ?? '/';
            const [pathname = '/', query] = requestUrl.split('?', 2);
            const acceptsHtml = request.headers.accept?.includes('text/html');

            if (acceptsHtml && (pathname === '/guides' || pathname.startsWith('/guides/'))) {
              const canonicalPath = pathname.replace(/^\/guides/, '/docs');
              response.statusCode = 308;
              response.setHeader('Location', `${canonicalPath}${query ? `?${query}` : ''}`);
              response.end();
              return;
            }

            next();
          });
        },
      },
    ],
    build: {
      // VitePress local search emits one generated search-index chunk. Keep the
      // warning threshold aligned with that known docs-only artifact.
      chunkSizeWarningLimit: 1200,
    },
    resolve: {
      dedupe: ['vue'],
    },
  },
  title: 'Sovereign',
  description:
    'Sovereign is an open-source workspace runtime for hosting private, multi-user apps on infrastructure you control.',

  themeConfig: {
    nav: [
      { text: 'Product', link: '/product/' },
      { text: 'Instances', link: '/instances' },
      { text: 'Get Started', link: '/get-started/' },
      { text: 'Roadmap', link: '/product-roadmap' },
      { text: 'Docs', link: '/docs/' },
      { text: 'GitHub', link: 'https://github.com/sovereignfs/sovereign' },
    ],

    sidebar: {
      '/product/': [
        {
          text: 'Product',
          items: productSidebarItems,
        },
      ],
      '/get-started/': [
        {
          text: 'Get Started',
          items: gettingStartedSidebarItems,
        },
      ],
      '/docs/': [
        {
          text: 'Documentation',
          items: docsHubSidebarItems,
        },
      ],
      '/': [
        {
          text: 'Operator Guides',
          items: [
            { text: 'Self-Hosting', link: '/self-hosting' },
            { text: 'Upgrade Guide', link: '/upgrade' },
            { text: 'Troubleshooting', link: '/troubleshooting' },
          ],
        },
        {
          text: 'App Developer Guides',
          items: [
            { text: 'Overview', link: '/plugin-development' },
            { text: 'SDK Stability', link: '/sdk-stability' },
            { text: 'Plugin Database', link: '/plugin-database' },
            { text: 'Design System', link: '/design-system' },
          ],
        },
        {
          text: 'Architecture & Security',
          items: [
            { text: 'Architecture', link: '/architecture' },
            { text: 'Security', link: '/security' },
            { text: 'Repository Map', link: '/repositories' },
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
          text: 'Contributor Guides',
          items: [
            { text: 'Documentation Structure', link: '/documentation-structure' },
            { text: 'Development Workflow', link: '/development-workflow' },
            { text: 'Agent-First Documentation', link: '/agent-first-documentation' },
            { text: 'Architecture Rules', link: '/architecture-rules' },
            { text: 'Testing E2E', link: '/testing-e2e' },
            { text: 'PWA Device Testing', link: '/pwa-real-device-testing' },
          ],
        },
        {
          text: 'RFCs',
          collapsed: true,
          items: rfcSidebarItems.slice(0, 1),
        },
      ],
    },

    search: { provider: 'local' },

    socialLinks: [{ icon: 'github', link: 'https://github.com/sovereignfs/sovereign' }],

    footer: {
      message: 'Open source under AGPL-3.0. Each Sovereign instance is independently operated.',
      copyright: 'Sovereign',
    },
  },
});

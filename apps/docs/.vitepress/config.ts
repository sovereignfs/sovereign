import { defineConfig } from 'vitepress';
import {
  getPrivateDocumentPaths,
  getRfcSidebarItems,
  isPublicDocument,
  publicGuideRewrites,
} from './publication';

const rfcIndexItem = { text: 'RFC Index', link: '/rfcs/README' };
const rfcSidebarItems = [rfcIndexItem, ...getRfcSidebarItems()];

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
      '/rfcs/': [
        {
          text: 'RFCs',
          items: rfcSidebarItems,
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
          items: [rfcIndexItem],
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

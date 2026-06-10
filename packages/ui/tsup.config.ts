import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  // CSS Modules and token CSS are left as external imports — tsup/esbuild can't
  // scope-hash CSS Modules. The consuming Next.js app (via transpilePackages in
  // v1, its bundler when installed from npm) processes the CSS. The .css files
  // ship via the package `files` field; npm-publish CSS packaging is finalised
  // in Task 0.5.07.
  external: [/\.css$/, 'react', 'react-dom', 'react/jsx-runtime'],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});

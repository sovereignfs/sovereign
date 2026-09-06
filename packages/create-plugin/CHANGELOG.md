# Changelog

All notable changes to `@sovereignfs/create-plugin` are documented here.
The package follows [Semantic Versioning](https://semver.org).

## 0.2.2

- The scaffolded `package.json` pins `typescript` to `^6.0.0` instead of
  `latest` — npm's `latest` is now the 7.x Go-hosted compiler, which
  typescript-eslint does not support and which turns TypeScript 6.0's
  deprecations into hard errors. Matches the platform (TypeScript 6.0).
- `sv plugin new` (the in-repo copy of this skeleton, `bin/helpers.ts`) no
  longer emits `compilerOptions.baseUrl` either; 0.2.1 fixed only the
  `npm create` template. A test now pins both.
- The skeleton now ships `css-modules.d.ts` (the ambient `*.module.css`
  declaration the example plugins carry) and a `typecheck` script, so a
  freshly scaffolded plugin's own `tsc --noEmit` passes instead of failing on
  every CSS Module import.

## 0.1.3

- The scaffolded page now wraps its content in `@sovereignfs/ui`'s
  `PageContainer` instead of a bare `<div>`, and the scaffolded CSS module no
  longer sets `padding`/`max-width` on the page's root class. The runtime
  shell stopped padding plugin content in `@sovereignfs/ui` 0.55.0
  (task 9.25); a plugin scaffolded before this change would otherwise render
  double-padded on old platform versions and edge-to-edge on current ones.

## 0.1.2

- Scaffolded `package.json` now pins `"version": "0.0.0"` instead of `"0.1.0"`.
  The platform reads a plugin's version exclusively from `manifest.json`;
  `package.json`'s version field is unused tooling metadata and is never
  meant to be bumped.

## 0.1.0

**Initial release** (Task 0.5.27, RFC 0017).

- Interactive CLI scaffolding tool: prompts for plugin ID, display name,
  description, and route prefix, then creates a complete plugin skeleton.
- Output: `manifest.json`, `package.json`, `tsconfig.json`, `icon.svg`,
  `app/page.tsx`, `app/<slug>.module.css` — all using `latest` npm references
  suitable for a standalone plugin repository.
- Invokable as `npm create @sovereignfs/plugin` (npm expands
  `create @sovereignfs/plugin` → `@sovereignfs/create-plugin`).

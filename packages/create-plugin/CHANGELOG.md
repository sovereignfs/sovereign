# Changelog

All notable changes to `@sovereignfs/create-plugin` are documented here.
The package follows [Semantic Versioning](https://semver.org).

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

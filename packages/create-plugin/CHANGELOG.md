# Changelog

All notable changes to `@sovereignfs/create-plugin` are documented here.
The package follows [Semantic Versioning](https://semver.org).

## 0.1.0

**Initial release** (Task 0.5.27, RFC 0017).

- Interactive CLI scaffolding tool: prompts for plugin ID, display name,
  description, and route prefix, then creates a complete plugin skeleton.
- Output: `manifest.json`, `package.json`, `tsconfig.json`, `icon.svg`,
  `app/page.tsx`, `app/<slug>.module.css` — all using `latest` npm references
  suitable for a standalone plugin repository.
- Invokable as `npm create @sovereignfs/plugin` (npm expands
  `create @sovereignfs/plugin` → `@sovereignfs/create-plugin`).

# @sovereignfs/create-plugin

Interactive scaffolding tool for [Sovereign](https://github.com/sovereignfs/sovereign) plugins.

## Usage

```bash
npm create @sovereignfs/plugin
# or: pnpm create @sovereignfs/plugin
# or: yarn create @sovereignfs/plugin
```

You will be prompted for:

- **Plugin ID** — reverse-DNS identifier, e.g. `com.example.my-plugin`
- **Display name** — shown in the sidebar and Launcher
- **Description** — one-line summary shown in the Console
- **Route prefix** — URL the plugin serves under, e.g. `/my-plugin`

The tool creates a directory named after your plugin ID in the current folder,
containing a complete plugin skeleton ready to install into a Sovereign instance:

```
com.example.my-plugin/
  manifest.json          ← identity, routing, permissions
  package.json           ← @sovereignfs/sdk + @sovereignfs/ui + next/react
  tsconfig.json          ← extends @sovereignfs/tsconfig/nextjs.json
  icon.svg               ← 24×24 stroke SVG placeholder
  app/
    page.tsx             ← server component at <routePrefix>/
    my-plugin.module.css ← CSS Modules using --sv-* design tokens
```

## Next steps after scaffolding

```bash
cd com.example.my-plugin
pnpm install          # type-check deps; you won't run next dev here

# Inside a Sovereign checkout, install and run:
pnpm sv plugin add https://github.com/YOUR_ORG/YOUR_REPO
pnpm dev
```

Visit `http://localhost:3000<routePrefix>` to see your plugin running.

## Documentation

- [Plugin development guide](https://github.com/sovereignfs/sovereign/blob/main/docs/plugin-development.md)
- [Design system](https://github.com/sovereignfs/sovereign/blob/main/docs/design-system.md)
- [SDK stability & semver policy](https://github.com/sovereignfs/sovereign/blob/main/docs/sdk-stability.md)
- [GitHub template repository](https://github.com/sovereignfs/sovereign-plugin-template) — alternative to this CLI

## License

AGPL-3.0-or-later

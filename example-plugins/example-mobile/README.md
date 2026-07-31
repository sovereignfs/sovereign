# Example: Mobile Layout

A reference plugin demonstrating `@sovereignfs/ui`'s PWA/mobile layout
primitives. This is a **testbed and showcase, not a shipped feature** — it
lives in `example-plugins/` at the repo root, outside `plugins/`, so it is
never bundled, composed, or installed automatically. Plugin developers copy
it into `plugins/` locally to run and read it.

## What it shows

- **`ResponsiveSurface`** (`@sovereignfs/ui`) — forks the whole page between a
  desktop tree and a mobile tree. Only the active side is ever mounted.
- **`SwipableMobileCarousel`** + **`SwipableMobileCarouselSlide`**/`Header`/
  `Body`/`Footer` — the swipeable mobile layout system: a native
  scroll-snap-driven carousel where each slide's header/footer render
  immediately from known data, independent of the slide body's own loading
  state.

More mobile capabilities (as they ship in `@sovereignfs/ui`) will be added to
this same plugin over time — see `docs/design-system.md`'s "Mobile carousel &
responsive fork" section for the underlying primitives' full API.

## Running it locally

This plugin is not part of the workspace's normal dev composition — copy it
into `plugins/` first. **Copy only `manifest.json`, `icon.svg`, and `app/`** —
not `package.json`/`tsconfig.json`/`css-modules.d.ts`. Those exist so this
source directory typechecks on its own as a workspace member
(`@sovereignfs/example-mobile`); composing a plugin into the running app
(`scripts/generate-registry.ts`) only ever reads its `manifest.json` and
`app/` — never its `package.json` — so copying that file too just creates a
second pnpm workspace package with the same name as this one, which pnpm
refuses to resolve at all:

```bash
mkdir -p plugins/example-mobile
cp -r example-plugins/example-mobile/{manifest.json,icon.svg,app} plugins/example-mobile/
pnpm dev
```

Then visit `/example-mobile`. Resize the browser below 768px (or open on a
real device) to see the swipeable carousel; the desktop view shows a static
notice instead, since this plugin has nothing to show in a wide layout by
design.

Remove `plugins/example-mobile` when you're done — it's gitignored there (the
generic `/plugins/*/` rule), so it won't accidentally get committed.

### Alternative: via `sovereign.plugins.json`

To exercise the same install path a real operator/CI build uses
(`scripts/install-plugins.ts`), rather than a plain copy, add an entry to
your local, gitignored `sovereign.plugins.json` pointing `repository` at a
`file://` URL for this same checkout, with `subdir` set to this plugin's path:

```bash
cat > sovereign.plugins.json <<EOF
{
  "plugins": [
    {
      "id": "example-mobile",
      "repository": "file://$(pwd)",
      "ref": "$(git rev-parse HEAD)",
      "subdir": "example-plugins/example-mobile"
    }
  ]
}
EOF
pnpm dev
```

`pnpm dev` itself runs `install-plugins.ts` as its first step, so no separate
install command is needed. Two things worth knowing before reaching for this
over the `cp -r` above:

- **`ref` must point at a commit that actually has this plugin.**
  `install-plugins.ts` clones via `git`, which only sees committed history —
  if `example-plugins/example-mobile` only exists as an uncommitted change on
  your current branch, commit it locally first (it doesn't need to be pushed
  or merged). Omitting `ref` clones the repository's default branch (`main`),
  not whatever you currently have checked out.
- **It's a one-time clone, not a live link.** `install-plugins.ts` skips an
  id once `plugins/<id>/` already exists, so editing the plugin's source
  afterwards has no effect until you delete `plugins/example-mobile` and
  re-run `pnpm dev`. For active iteration on the plugin itself, the `cp -r`
  above stays the faster loop.
- **This copies the whole subdirectory verbatim, `package.json` included.**
  Unlike the manual `cp -r` above, `install-plugins.ts`'s subdir copy has no
  way to exclude files — so it recreates the exact same pnpm workspace
  name collision described above. Delete (or rename the `name` field in)
  `plugins/example-mobile/package.json` before running `pnpm install`/
  `pnpm dev` if you use this route.

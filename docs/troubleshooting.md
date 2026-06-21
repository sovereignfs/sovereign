# Troubleshooting

Known issues, workarounds, and debugging notes for Sovereign development and self-hosting.

---

## Development server

### 404 on first navigation to an overlay plugin after server restart

**Symptom:** Clicking the Console or Account icon in the sidebar shows "404 — This page could not be found." The server log shows `200` for the same request (or the route compiles immediately before the 200 line).

**Cause:** Overlay plugins (`shell: "overlay"`) compose into two places:

1. A full-page fallback under `(plugins)/<routePrefix>/`
2. An interception copy under `(plugins)/@modal/(.)<routePrefix>/`

Next.js compiles App Router routes **lazily** — each route only compiles on its first request. On a cold dev-server start, the `/(.)console` (or `/(.)account`) interception route has never been compiled. A soft-navigation that arrives during that compilation window gets a broken React tree: the `@modal` slot can't resolve the intercepted segment and renders nothing, while the children stay on the previous page. The result looks like a 404 even though the HTTP response is 200.

**Workaround:** Do a hard reload (**Cmd+R** on macOS, **Ctrl+R** on Windows/Linux) after the server finishes compiling. The route will be ready by then and the hard reload fetches a fresh server render.

**Why it doesn't recur:** Once compiled, the interception route stays in Next.js's in-memory route cache for the lifetime of the dev-server process. Subsequent soft-navigations work immediately.

**Not a bug in the compose output:** You can verify the routes are correctly placed with:

```bash
ls runtime/app/\(platform\)/\(plugins\)/@modal/
# Should show: (.)account  (.)console  default.tsx  layout.tsx
```

If the interception directories are missing, re-run `pnpm generate` to recompose plugin routes.

---

### Intermittent 404 on plugin routes during development (spurious recompiles)

**Symptom:** A plugin page that was working suddenly 404s on soft-nav without any code change. A hard reload fixes it.

**Cause (historical):** Before the `syncDir()` fix in `scripts/generate-registry.ts`, the generate watcher re-copied every plugin route file on every manifest change — updating mtimes even when file content was unchanged. Next.js's dev route watcher treated those mtime changes as route invalidations, evicting compiled route entries from its cache. A soft-nav during the recompile window got the same broken-React-tree 404 as above.

**Current behaviour:** `syncDir()` performs a content-aware incremental copy: it only writes a file if its size or mtime differs from the destination. Unchanged files are not touched, so their mtimes stay stable and Next.js does not invalidate them.

If you see this in a fresh checkout, check that `syncDir` is in use in `composePlugins()` inside `scripts/generate-registry.ts`.

---

### `/(.)console` or `/(.)account` 404 persists after hard reload

If Cmd+R doesn't fix it, the interception copy is likely missing from disk. This can happen if:

- `pnpm generate` was interrupted mid-run.
- The `(plugins)/.gitignore` keep-list was accidentally edited to exclude `(.)console` or `(.)account`.

Check and re-run:

```bash
ls runtime/app/\(platform\)/\(plugins\)/@modal/
pnpm generate   # recomposes all plugin routes
```

---

## Docker / production

See [`docs/self-hosting.md`](self-hosting.md) for Docker-specific troubleshooting (volume ownership, `pnpm-workspace.yaml` marker, IPv4 healthcheck, etc.).

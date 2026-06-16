# Submitting a plugin to the Sovereign registry

The registry ([`plugins.json`](plugins.json)) is the public index of plugins that
can be installed on a Sovereign instance. Listing here makes a plugin
discoverable; it does **not** bundle or host your code — the plugin stays in your
own repository and an operator installs it from there.

This document is the submission process. For how to _build_ a plugin, see
[`docs/plugin-development.md`](../docs/plugin-development.md).

## What gets listed

Each entry in `plugins.json` is a **thin record** — a pointer to your plugin's
source plus a little display metadata. It is **not** a copy of your manifest:
the manifest stays in your repository and is fetched from there at install time,
so it can never drift out of sync with the registry. An entry looks like:

```jsonc
{
  "registryVersion": 1,
  "plugins": [
    {
      "id": "io.example.tasks",
      "repository": { "type": "git", "url": "https://github.com/you/sovereign-plugin-tasks" },
      "name": "Tasks",
      "description": "A simple task manager.",
      "tags": ["productivity"], // optional
    },
  ],
}
```

Fields:

- **`id`** — globally-unique reverse-DNS id (matches your manifest's `id`).
- **`repository`** — where the plugin lives: `{ "type": "git", "url": "<clone URL>" }`,
  or `{ "type": "path", "url": "<path>" }` for a first-party/local source. This
  is the source the manifest is fetched from.
- **`name`**, **`description`** — display metadata so the index is browsable
  without fetching every manifest.
- **`tags`** _(optional)_ — discovery keywords.

Operational fields (`version`, `permissions`, `routePrefix`, `compatibility`, …)
are **not** duplicated here — they come from the fetched manifest.

The registry lists only **third-party** plugins. The built-in platform plugins
(Console, Launcher, Account) are **not** listed: they ship inside the platform,
have no standalone source, and are always present. The array starts empty and
grows as community plugins are submitted.

## Requirements

A submission is accepted only if **all** of the following hold. The first is
checked automatically by the registry test suite (`registry/__tests__`); the
rest are verified during review against your plugin's source.

1. **Valid registry entry.** Your entry must validate against the registry-entry
   schema (`validateRegistryEntry` in `@sovereignfs/manifest`). Run `pnpm test` —
   the registry test validates every entry and fails CI on an invalid one.
   Unknown keys are rejected, so typos fail fast.
2. **Valid manifest at the source.** The `manifest.json` in your repository must
   itself be a valid manifest (`type: "sovereign"` or `"community"`). The
   platform validates it when the plugin is installed (`sv plugin add` /
   `pnpm install:plugins` both run `validateManifest`); a reviewer confirms it.
3. **Public / accessible source.** A `git` source must be a public clone URL;
   operators install from it directly.
4. **LICENSE file.** The source repository must include a `LICENSE` file. Any
   OSI-approved licence is fine; proprietary/commercial plugins must still state
   their terms in a `LICENSE`.
5. **Compatible platform version.** Your manifest's
   `compatibility.minPlatformVersion` must be a real, released platform version
   your plugin actually supports. Do not claim a version you have not tested
   against.
6. **Unique id.** `id` must be globally unique (reverse-DNS, e.g.
   `io.example.tasks`) and not collide with an existing entry.
7. **Honest metadata.** `name`, `description`, and `tags` must describe the
   plugin accurately.

## How to submit

1. **Fork** this repository.
2. **Add your entry** to the `plugins` array in
   [`registry/plugins.json`](plugins.json). Do not reformat unrelated entries.
3. **Validate locally:** `pnpm test` (the registry suite must pass) and
   `pnpm format` (Prettier governs the JSON).
4. **Open a pull request** using the registry submission template:
   append `?template=registry-submission.md` to the PR URL, or pick
   **Registry submission** from the template chooser when opening the PR.

A maintainer reviews the requirements above and merges. Updates to an existing
plugin (new version, changed metadata) follow the same flow — edit your entry
and open a PR.

## Removal

To delist a plugin, open a PR removing its entry, or open an issue if you cannot.
Delisting does not affect instances that already installed it.

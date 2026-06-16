# Submitting a plugin to the Sovereign registry

The registry ([`plugins.json`](plugins.json)) is the public index of plugins that
can be installed on a Sovereign instance. Listing here makes a plugin
discoverable; it does **not** bundle or host your code — the plugin stays in your
own repository and an operator installs it from there.

This document is the submission process. For how to _build_ a plugin, see
[`docs/plugin-development.md`](../docs/plugin-development.md).

## What gets listed

Each entry in `plugins.json` is a plugin **manifest** — the same object that
lives in your plugin's `manifest.json`. The registry file is:

```jsonc
{
  "registryVersion": 1,
  "plugins": [{ "schemaVersion": 1, "id": "io.example.tasks", "name": "Tasks" /* … */ }],
}
```

The platform's own chrome plugins (e.g. Console) seed the list as `type:
"platform"` entries; community submissions are `type: "sovereign"` or
`"community"`.

## Requirements

A submission is accepted only if **all** of the following hold. The first is
checked automatically by the registry test suite (`registry/__tests__`); the
rest are verified during review.

1. **Valid manifest.** Your entry must validate against the manifest schema
   (`@sovereignfs/manifest`). Run `pnpm test` — the registry test validates
   every entry and fails CI on an invalid one. Unknown keys are rejected, so
   typos fail fast.
2. **Public repository.** `repository` must be a public git URL (required for
   `sovereign`/`community` types). Operators install from it directly.
3. **LICENSE file.** The repository must include a `LICENSE` file. Any
   OSI-approved licence is fine; proprietary/commercial plugins must still state
   their terms in a `LICENSE`.
4. **Compatible platform version.** `compatibility.minPlatformVersion` must be a
   real, released platform version your plugin actually supports. Do not claim a
   version you have not tested against.
5. **Unique id.** `id` must be globally unique (reverse-DNS, e.g.
   `io.example.tasks`) and not collide with an existing entry.
6. **Honest metadata.** `name`, `description`, and `version` must describe the
   plugin accurately.

## How to submit

1. **Fork** this repository.
2. **Add your entry** to the `plugins` array in
   [`registry/plugins.json`](plugins.json). Keep the array sorted is not
   required, but do not reformat unrelated entries.
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

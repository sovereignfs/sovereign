# Sovereign Docs

**Version:** 0.1\
**Date:** June 2026\
**Author:** kasunben\
**Purpose:** Canonical specification for the Sovereign Docs plugin — the single source of truth for its manifest, access model, data model, and build plan.\
**Status:** Draft

---

Sovereign Docs is a **git-backed document workspace** — a place to write, organise,
and share documents, where the documents live in a git repository the user owns
(their "**Sovereign Drive**"). Each document is a Markdown file under a `docs/` tree;
drafts live on the platform until the user publishes them to git; revisions are read
back from git history. It is the personal/shared-document cousin of **Plainwrite**:
the two share the hard machinery (git-provider adapters, encrypted credentials,
draft-in-DB → publish-to-git, history-as-revisions) but target different products —
Plainwrite edits content for a **static site**, Sovereign Docs is a **Notion/Google-
Docs-style document workspace** backed by your own repo.

**Design principles:** own your data (it's plain Markdown in your git repo, readable
without Sovereign), minimalism (a clean Markdown-first editor), and reliability
(drafts never lost — they persist on the platform until you publish).

v0.1 targets **GitHub** and a **single repo per user**; the git layer is built around
a **provider adapter** interface (shared with Plainwrite) so GitLab/Gitea and
multiple repos follow without touching core logic. Document-content encryption and
multiple repos are **post-v1**.

The plugin is `type: sovereign` — maintained in a separate external repository.

## Contents

- [Identity and manifest](#identity-and-manifest)
- [Access control](#access-control)
- [Functional requirements](#functional-requirements)
- [Architecture: git layer + DB drafts](#architecture-git-layer--db-drafts)
- [Public sharing](#public-sharing)
- [Directory structure](#directory-structure)
- [Data model](#data-model)
- [SDK dependencies](#sdk-dependencies)
- [UI](#ui)
- [Build plan](#build-plan)
- [Open questions](#open-questions)
- [Changelog](#changelog)

---

## Identity and manifest

| Property                           | Value                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `id`                               | `io.openfs.sovereign.docs`                                                             |
| `name`                             | `Sovereign Docs`                                                                       |
| `type`                             | `sovereign`                                                                            |
| `runtime`                          | `native`                                                                               |
| `routePrefix`                      | `/docs`                                                                                |
| `shell`                            | `default` (editor view collapses the chrome)                                           |
| `adminOnly`                        | omitted (`false`)                                                                      |
| `icon`                             | `icon.svg`                                                                             |
| `permissions`                      | `auth:session`, `db:readWrite`, `mailer:send`                                          |
| `repository`                       | `https://github.com/sovereignfs/sovereign-plugin-docs`                                 |
| `compatibility.minPlatformVersion` | _the platform version that ships the public-page route primitive_ (see Open questions) |

Proposed `manifest.json`:

```json
{
  "schemaVersion": 1,
  "id": "io.openfs.sovereign.docs",
  "name": "Sovereign Docs",
  "version": "0.1.0",
  "description": "A git-backed document workspace.",
  "type": "sovereign",
  "runtime": "native",
  "routePrefix": "/docs",
  "shell": "default",
  "icon": "icon.svg",
  "permissions": ["auth:session", "db:readWrite", "mailer:send"],
  "repository": "https://github.com/sovereignfs/sovereign-plugin-docs",
  "compatibility": { "minPlatformVersion": "0.5.0" }
}
```

**Shell choice.** A plugin declares one `shell`; the index wants the platform chrome
but the editor wants a full surface. Sovereign Docs uses `shell: default` and
**collapses the chrome in the editor view** (layout/CSS). It deliberately does _not_
depend on `shell: minimal` (RFC 0014, unwired) for v1; if/when minimal lands, the
editor can move to it.

**Env vars** (declared in the plugin's scope per RFC 0018): a credential-encryption
key (`SOVEREIGN_ENCRYPTION_KEY`, or a `DOCS_`-scoped key — see Open questions),
required, no default; optional GitHub OAuth `clientId`/`clientSecret` (PAT is the
fallback when OAuth isn't configured).

**Plugin capabilities** (RFC 0022, when available): `docs:share` (share within the
instance), `docs:publish-public` (create a public share). Until the capability layer
lands, these map to "any authenticated owner of the document."

## Access control

- **Private by default.** A document is visible only to its owner until shared.
- **Instance sharing.** The owner shares a document (or a project) with other users
  on the same instance via a members table — roles `owner` / `editor` / `viewer`.
- **Public sharing.** The owner can make a document publicly viewable via a
  **public-share token** (expiring by default; permanent on explicit opt-in) — see
  [Public sharing](#public-sharing).
- The plugin's authenticated routes inherit the platform session gate (PLT-02/03);
  the **public document route is the one exception** and does its own auth (token or
  session) — which is the platform dependency noted in Open questions.

## Functional requirements

| ID      | Requirement                                                                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOCS-01 | On first use, the user configures their **Sovereign Drive**: point a git repository (private or public) with **write** access, via a **GitHub PAT** or the **GitHub OAuth** browser flow.         |
| DOCS-02 | On configuration, the plugin creates a **`docs/`** directory in the repo; all documents are organised under it. v1 supports **one repo**; multiple repos are post-v1.                             |
| DOCS-03 | The user can create **document projects** and **individual documents**. _Create project_ prompts for a name (→ a folder under `docs/`); _create document_ opens the editor with a blank document. |
| DOCS-04 | The **editor** is minimalistic and **Markdown by default**, with a toggle to a **rich-text** editor over the same Markdown.                                                                       |
| DOCS-05 | **Save** persists a **draft on the platform** (not pushed). **Publish** pushes the document's content to the configured git repository.                                                           |
| DOCS-06 | **Revisions** are presented from the document's **git history** (commits filtered to the file path).                                                                                              |
| DOCS-07 | The **plugin index** lists all documents and document projects owned by (or shared with) the user.                                                                                                |
| DOCS-08 | Opening a document/project opens a **view mode** with a toggle to **edit mode**.                                                                                                                  |
| DOCS-09 | The user can **share** a document with other users **within the instance** (roles owner/editor/viewer).                                                                                           |
| DOCS-10 | A document can be made **public** and shared via a public link — **expiring by default**, **permanent** only when explicitly set.                                                                 |

## Architecture: git layer + DB drafts

**Git via REST, no git binary.** The standalone image ships no `git` binary and
avoids native deps, so all repo operations go through **provider REST APIs** (same
choice as Plainwrite) — no `isomorphic-git`, no server-side clone:

- **List / read** documents — GitHub Contents / Git trees API.
- **Publish** — single file via the Contents API; atomic multi-file via the Git Data
  API (blob → tree → commit → ref) so no partial commit lands.
- **Revisions** — the commits API filtered by the document's path; a revision view
  reads a file at a given commit SHA.
- **Conflict detection** — each draft stores the **base SHA** it was fetched at; if
  the file moved on the remote (edited directly on GitHub) since, publish surfaces a
  conflict instead of clobbering.

**Provider adapter (shared with Plainwrite).** A `GitProvider` interface (file
tree/content, publish single/multi, OAuth URL + code exchange, user info) with a
`GitHubProvider` implementation in v0.1; GitLab/Gitea follow. This adapter layer
should be **extracted into a shared package/library** so Sovereign Docs and Plainwrite
don't duplicate it (Open question).

**Draft lifecycle.**

```
edit → Save  → status: draft      (platform DB only, never lost)
     → Publish → status: published (pushed to git; revision recorded by the commit)
```

Drafts live in the platform DB until published, so a network/API failure never loses
work; publishing is the only operation that touches the remote.

**Credentials & encryption (v1).** The per-user git token (PAT or OAuth access/refresh)
is stored **encrypted with AES-256-GCM** under an instance env key
(`<iv_hex>:<ciphertext_hex>`), decrypted in memory only immediately before a provider
call; the plugin **fails fast at startup if the key is unset** (no-default-secret
rule). This is **plugin-level** encryption — feasible in v1 and independent of the
platform's deferred at-rest encryption (RFC 0008 Tier 2). **Only document-content
E2EE is post-v1**; a write-scoped git token must not sit in plaintext.

## Public sharing

Public access needs care because the runtime **session-gates every page** — there is
no public-page primitive today (only the single `apiProvider` `/api/*` namespace is
session-exempt, PLT-16). Sovereign Docs' model:

- A **`docs_public_shares` token registry** maps a token → document, with a `mode`
  (`expiring` | `permanent`) and `expires_at`.
- A **public document route** (e.g. a clean `/docs/<project>/<slug>` or `/docs/p/<token>`)
  serves the document as a **read-only HTML page in a clean layout**, doing its **own
  auth in the background** — render publicly if a valid share token resolves,
  otherwise require a session (and 404 to strangers if neither). This is the
  `apiProvider` "plugin owns auth" pattern, applied to a **page** route.
- **Expiry-first:** public shares default to an **expiring** link (a TTL sweep cleans
  them up, so the server doesn't accumulate unbounded public pages); a **permanent**
  public document must be set explicitly, and may be cached.

**Platform dependency (the key one):** the middleware must **exempt the plugin's
public document route from the global session gate** so the plugin can do its own
token-or-session auth. This primitive does not exist for pages yet — it likely
warrants a small platform RFC (generalising the `apiProvider` exemption to a
plugin-declared public page route). Until it lands, public sharing falls back to
"the document's repo/file is public on GitHub" (link out).

## Directory structure

In the repo (the Sovereign Drive):

```
docs/
  <project-slug>/
    <doc-slug>.md
  <doc-slug>.md          # standalone documents (no project)
```

In the plugin (mirrors the other plugin specs): `app/` (index, editor, view, share,
drive-config, and the public route), `db/schema.ts` (the `docs_*` tables),
`app/_lib/` (the git provider adapter, credential crypto, Markdown↔rich-text), and
`app/_components/`.

## Data model

All tables are `docs_`-prefixed and carry `tenant_id` (platform rule); composite PKs
on the members/share tables; the owner row is inserted automatically on creation.

| Table                   | Key columns                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs_drives`           | `user_id` (PK in v1, one repo/user), `tenant_id`, `provider`, `repo_owner`, `repo_name`, `branch`, `base_path` (`docs`), `created_at`                  |
| `docs_credentials`      | `user_id` (PK), `tenant_id`, `auth_type` (`oauth`\|`pat`), `access_token_encrypted`, `refresh_token_encrypted?`, `token_expires_at?`, `provider_login` |
| `docs_projects`         | `id`, `tenant_id`, `owner_id`, `name`, `slug` (folder), `created_at`                                                                                   |
| `docs_documents`        | `id`, `tenant_id`, `owner_id`, `project_id?`, `title`, `slug` (file path), `status` (`draft`\|`published`), `created_at`, `updated_at`                 |
| `docs_drafts`           | `document_id` + `user_id` (PK), `tenant_id`, `content` (Markdown), `base_sha` (conflict), `updated_at`                                                 |
| `docs_document_members` | (`document_id`, `user_id`) PK, `tenant_id`, `role` (`owner`\|`editor`\|`viewer`), `invited_by?`, `joined_at`                                           |
| `docs_public_shares`    | `id`, `tenant_id`, `document_id`, `token` (unique), `mode` (`expiring`\|`permanent`), `expires_at?`, `created_by`, `created_at`                        |

(Project-level sharing may reuse a `docs_project_members` table on the same pattern;
v0.1 can scope sharing to documents and add projects later.)

## SDK dependencies

- **`sdk.auth`** — `getSession()` / `requireSession()` for the current user; **needs a
  user-directory surface** (e.g. `sdk.auth.listUsers()`) to pick share targets — that
  doesn't exist today (Open question / platform gap).
- **`sdk.db`** — the `docs_*` tables (drafts + metadata + shares).
- **`sdk.mailer`** — share-notification emails.

Reserved surfaces it will adopt later: **`sdk.storage`** (document images/assets,
post-v1), **`sdk.notifications`** (share alerts via the Notification Center), and
**`sdk.crypto`** (document-content E2EE, post-v1).

## UI

- **Index** — projects + documents owned by / shared with the user; create-project
  (name prompt) and create-document actions.
- **Editor** — minimalistic Markdown by default with a **rich-text toggle**; Save /
  Publish; a **revisions panel** (git history for the file); chrome collapsed.
- **Viewer** — clean read-only render with an **edit toggle** (when permitted); the
  public route reuses this read-only layout.
- **Share dialog** — pick instance users + role; a **public toggle** with
  expiring/permanent.
- **Drive config** — first-run repo connection (PAT or GitHub OAuth).

Net-new UI primitives: the Markdown/rich-text editor and the revision/diff view (not
in `@sovereignfs/ui` today).

## Build plan

- **v0.1** — drive config (GitHub **PAT**, encrypted), create project/document, the
  Markdown editor, **Save (draft)** + **Publish (git)**, the index, view/edit toggle,
  **revisions** from git history; **single repo**; **private + instance sharing**.
- **v0.2** — **rich-text toggle**; **GitHub OAuth**; **public sharing** via the token
  registry (**expiring** links) — gated on the public-page platform primitive.
- **v0.3** — **permanent** public docs + caching; **conflict resolution** on external
  edits; **images/assets** in documents.
- **v1.0** — stable.
- **Post-v1** — **multiple repos**; **document-content E2EE** (`sdk.crypto`); GitLab/
  Gitea providers.

## Open questions

1. **Public-page platform primitive (key dependency).** A session-gate exemption for
   the plugin's public document route (the plugin doing its own token/session auth) —
   does not exist for pages; likely a small platform RFC generalising the
   `apiProvider` exemption. Until then, public = public GitHub repo.
2. **User-directory SDK.** Sharing needs to find instance users; `sdk.auth` exposes
   only the current session today.
3. **Image / asset storage.** Git blobs in the repo now, vs the post-v1 `sdk.storage`
   surface; how relative image paths resolve in both the editor and the public render.
4. **Markdown ↔ rich-text fidelity.** Round-tripping without mangling raw Markdown
   (frontmatter, code blocks, tables).
5. **External-edit conflict policy.** Beyond detection via base SHA — overwrite,
   branch, or merge?
6. **Permanent-public performance.** Cache/pre-render vs render-on-request.
7. **Shared git layer.** Extracting the provider adapter + credential crypto into a
   package shared with Plainwrite.
8. **Encryption key.** Reuse the platform `SOVEREIGN_ENCRYPTION_KEY` vs a
   `DOCS_`-scoped key.
9. **Multi-repo** (post-v1) — drive selection per project/document.

## Changelog

| Version | Date     | Change            |
| ------- | -------- | ----------------- |
| 0.1     | Jun 2026 | Initial proposal. |

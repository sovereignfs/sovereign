# Phase 2 security review

What was looked at in core's services for apps (core-app §4) and the operator toolkit's server side, how, what it found, and what was
decided. It follows the [Phase 1 review](security-review-phase-1.md), which covered sign-in, the provider and the Console; the rules
themselves are in [`architecture-rules.md`](architecture-rules.md), and the properties worth keeping are tests.

## Scope and method

The review read the code that decides who may call what and with which data, then tried, in tests and against a real shell, what an
attacker tries first: a token of the wrong kind, another app's data, a body that never ends, a word that the server's shell would run.
It was done on platform 0.97.0 with toolkit 0.12.0 and better-auth 1.7.18 (November 2026).

| Area                                           | Looked at                                                                                                                                                                                                                                                                                                                         | Result                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| App tokens (§3.6.6)                            | `authenticateApp`: signature, `at+jwt`, issuer, audience, an app's own subject and no session; the scope in the token **and** among the app's scopes now; confidential and switched on; revocation by time                                                                                                                        | Sound                                                                                   |
| Who gets the grant                             | `client_credentials` only for a confidential app an operator gave an app scope (`ClientRegistry`); the provider holds it to those scopes; tested against a real database (`app-tokens.suite.ts`)                                                                                                                                  | Sound                                                                                   |
| Mail for apps (§4.2)                           | A person named by `sub`, never an address; only an active, verified person who has used the app and not switched it off; control characters refused (no header injection); a link only `https` on the app's own addresses; limits per app and per pair; one answer whether sent or dropped                                        | Sound                                                                                   |
| Notifications (§4.1)                           | Sent with an app's own token only; read, marked and dismissed with a person's token, and only the calling app's own notifications (`client_id` in every query); the same text, link and limit rules as mail                                                                                                                       | Sound                                                                                   |
| Activity (§4.3)                                | Written with an app's own token only, never read back by an app; the same rules                                                                                                                                                                                                                                                   | Sound                                                                                   |
| Request bodies (§3.9)                          | `bodyOf`: JSON objects of the allowed fields only, at most 16 KB                                                                                                                                                                                                                                                                  | **A body with no length was read whole; fixed**                                         |
| People's files (§4.6)                          | Session plus `files:manage`, and the origin checked, to upload or delete; ids and `sub`s matched against strict patterns before any path is made; type from bytes, only raster images inline, `nosniff`, `default-src 'none'; sandbox`; signed links bound to person, file and expiry, an hour at most, compared in constant time | Sound; see the accepted points                                                          |
| Account-deletion notices (§4.5)                | A signed token of two minutes that carries the `sub` and nothing else of the person, sent only to the `https` address an operator registered; a timeout, no redirect followed, the answer never read; retried with back-off, then given up                                                                                        | Sound; see the accepted points                                                          |
| `sv` over SSH (operator-cli §8)                | How a command reaches the server; the deployment key's `authorized_keys` line; the wrapper and the toolkit's parsing of a request                                                                                                                                                                                                 | **A word could be read by the server's shell; fixed**                                   |
| What a deployment sends (operator-cli §8)      | `sv receive`'s own tar reader: regular files only, no link or device, no name that climbs out, an allow-list of instance files, limits on size and count, all refused before anything is written                                                                                                                                  | Sound                                                                                   |
| Secrets and backups (operator-cli §7, §9, §10) | Secrets in `secrets/` (root only), mounted read-only; backups encrypted with age to the operators and not the server                                                                                                                                                                                                              | Sound; what a reader of the disk gets is [research 0006](research/0006-data-at-rest.md) |

## Findings

1. **A Core API body with no length was read whole before it was measured (fixed).** `bodyOf` refused a body whose `Content-Length`
   was over 16 KB, but a chunked request, which says no length, was read in full by `request.text()` first, so an app with any valid
   token could make core hold as much as it streamed. It is now read as a stream and refused, the rest unread, as soon as it passes
   16 KB, and the limit counts bytes rather than characters. Test: `api-body.test.ts`, whose endless stream the old code never finished.
2. **A word sent over SSH could be read as shell on the server (fixed).** `ssh` joins a command's words with spaces and the server's
   shell reads the line, so `sv logs 'x; reboot'` ran `reboot`. Over the operator's own access this crosses no privilege line (they are
   root there), and the deployment key cannot reach a shell at all (`restrict,command=` in `authorized_keys`; the request reaches the
   toolkit as one string that it parses strictly), but it is the interpolation the hard rules forbid, and the first word to come from
   somewhere less trusted would have made it real. Every word is now single-quoted unless plain (`shellWord`), and `sv logs` checks its
   name before asking. Tests: `server/remote.test.ts`, `commands/remote.test.ts`; each quoted word was checked through a real `sh`.

## Accepted, with the reason

- **A signed file link keeps working until it runs out after the account is deactivated.** It lasts an hour at most, names one file,
  and only its holder has it; checking the account on every signed read would make the links depend on the database for little.
- **A deletion notice goes to whatever `https` address the operator registered, an internal one included.** Operators are trusted to
  register their apps (`client:manage`); on an instance the apps are on the same host anyway. The request carries only a signed token
  and its answer is never read, so it cannot be used to read anything back.
- **The Core API's notification read endpoints mark and dismiss with the `notifications` read scope.** Changing whether a person has
  seen something an app sent them is part of reading it; it reaches only that app's own notifications.
- **Mail for apps is counted before the recipient is checked.** So a refused send costs the same as a sent one and tells the app
  nothing about the person, at the price of an app using up its limit on people it may not write to.

## To act on, outside this review

- **Reset and verification links are stored as they are** (better-auth's default; research 0006, finding 3). Storing them hashed is one
  setting, but it changes how better-auth stores data, so it is a task of its own, verified against the auth-store fixtures, and ends any
  link in flight when it ships.
- **What someone with the server's disk can read**, and the options, are research 0006.

## Not in this review

The design system and the SDK as libraries (an app's own use of them is the app's), the PWA's service worker beyond Phase 1's checks,
the GitHub deployment's workflow files as an instance repository holds them, and the operator's network, proxy and TLS, which
[deploying](deploying.md) covers.

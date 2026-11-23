# Workstreams

A **workstream** is an ordered sequence of epic tasks that together deliver one goal, with the decisions behind it already settled, so
that it can be picked up later and run leg by leg without the conversation that produced it.

| Layer                   | Organizes by   | Answers                                |
| ----------------------- | -------------- | -------------------------------------- |
| `ROADMAP.md`            | shipping order | what is next, what is done             |
| `docs/epics/<file>.md`  | domain         | every task in one area                 |
| `docs/rfcs/`            | decision       | why a design was chosen                |
| **`docs/workstreams/`** | **goal**       | **the ordered path to one capability** |

An epic groups tasks by domain; a workstream groups them by goal. Epic task IDs stay the permanent identifiers: a workstream refers to
them and never renumbers or restates them.

## What a workstream is not

- **Not a task spec.** Task detail stays in `docs/epics/<file>.md`.
- **Not a design document.** Behaviour lives in `docs/specs/` and design in RFCs. A workstream records which decisions are locked.
- **Not a status tracker.** Status stays in `ROADMAP.md` rows and epic headings.
- **Not a licence to skip review.**

## Legs

A workstream is divided into **legs**: one leg is one branch, one draft PR and one review gate, with one version bump. The contract,
gates and "Do not proceed if" conditions are in [development-workflow.md](../development-workflow.md#workstreams-and-the-leg-contract),
and the task skills run a leg when told "workstream NNNN leg N".

## Required sections

| Section                | Why                                                                             |
| ---------------------- | ------------------------------------------------------------------------------- |
| **Goal**               | What exists at the end that does not exist now                                  |
| **Definition of done** | Checkable conditions                                                            |
| **Decisions locked**   | Settled choices and the rejected alternatives, so they are not reopened mid-run |
| **Prerequisites**      | What must be true before leg 1, including work owned elsewhere                  |
| **Legs**               | Ordered table: leg, tasks, gate, done when                                      |
| **Leg detail**         | Why the leg is where it is, technical notes, and "Do not proceed if"            |
| **Risks**              | Known sharp edges                                                               |
| **Kill criteria**      | What stops the workstream, and what survives if it does                         |

Copy [TEMPLATE.md](TEMPLATE.md) to `NNNN-short-slug.md` and add a row below.

## Index

| Workstream                              | Goal                                                                                                                                        | Status         | Governs                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------- |
| [0001](0001-operator-workflow.md)       | Apps from their repositories, app upgrades, rollback to a chosen release, scheduled backups, and more from GitHub                           | 📋 Planned     | RFC 0002, epic 13                       |
| [0002](0002-test-instances.md)          | Development and staging instances know what they are, and can be seeded with accounts and a sample app; production never can                | 📋 Planned     | RFC 0002, epic 13                       |
| [0003](0003-encryption.md)              | An app keeps what people give it so that nobody who reads the server can read it, and people only sign in                                   | ⏳ In Progress | RFC 0005, epic 16                       |
| [0004](0004-encryption-follow-ups.md)   | What building encryption left: the kit's words under escrow, a smaller `/keys`, encrypted files, a no-core app in a browser                 | ⏳ In Progress | RFC 0005, epic 16                       |
| [0005](0005-encrypted-files-in-core.md) | Core's own files encrypted in the browser, after honest words and a recovery kit for everyone                                               | 📋 Planned     | RFC 0005, epic 16                       |
| [0006](0006-pwa.md)                     | Core and every app install, and an installed core opens installed apps where the device allows                                              | ⏳ In Progress | RFC 0001, epic 11                       |
| [0007](0007-sign-in.md)                 | Signing in keeps an app's request and verifies an invited person once; apps follow core's sessions; installed apps can lock                 | ⏳ In Progress | Research 0011, 0012; epics 4, 6, 14, 16 |
| [0008](0008-one-sign-in.md)             | Core and every app sign in with one package made from core's; core and local accounts as two ways in                                        | ⏳ In Progress | RFC 0007; epics 17, 2, 6, 13, 14        |
| [0009](0009-exports.md)                 | An owner and every person download their data, from core and every app, on demand                                                           | ⏳ In Progress | RFC 0008, epic 18                       |
| [0010](0010-web-push.md)                | Every app notifies a person on a device where it is not open, from one published implementation                                             | ⏳ In Progress | Research 0013, RFC 0009, epic 19        |
| [0011](0011-suite-alignment.md)         | Every app in development on the template's design: current packages, manifest 5, core's export, the shared worker, then `@sovereignfs/auth` | 📋 Planned     | Research 0014, epic 20                  |
| [0012](0012-app-frame.md)               | Every app's frame, settings and barcode from the design system; an app shows the launcher's apps and opens core's sign-up                   | ⏳ In Progress | Epic 21                                 |

_Status key: ✅ Complete · ⏳ In Progress · 📋 Planned · ⏸️ Paused · ❌ Stopped_

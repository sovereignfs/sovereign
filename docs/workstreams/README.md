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

| Workstream                        | Goal                                                                                                                         | Status     | Governs           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------- |
| [0001](0001-operator-workflow.md) | Apps from their repositories, app upgrades, rollback to a chosen release, scheduled backups, and more from GitHub            | 📋 Planned | RFC 0002, epic 13 |
| [0002](0002-test-instances.md)    | Development and staging instances know what they are, and can be seeded with accounts and a sample app; production never can | 📋 Planned | RFC 0002, epic 13 |

_Status key: ✅ Complete · ⏳ In Progress · 📋 Planned · ⏸️ Paused · ❌ Stopped_

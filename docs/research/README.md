# Research

Exploratory documents for open-ended questions with no concrete design yet:
findings, options and a recommendation. Research precedes an RFC; not every
research document becomes one, and a documented "not now" is a valid outcome.

| Research                                      | Question                                                                                                                  | Outcome                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [0001](0001-better-auth-oauth-provider.md)    | What does better-auth's OAuth provider do natively for core's sign-in server, and what must we build?                     | Build on it; small defined gaps; decided and applied to the spec and epics              |
| [0002](0002-third-party-app-compatibility.md) | Which real OpenID Connect apps can sign in with core, what stops the ones that cannot, and what core should change        |
| [0003](0003-database-connections.md)          | Can one PostgreSQL server hold core and more than ten apps safely, and should the toolkit offer limits, a pooler or both? | Guardrails for every instance, then an opt-in PgBouncer, both set from `sv`; for review |

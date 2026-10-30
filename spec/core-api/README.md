# Core API

`openapi.yaml` is the one definition of what an app may call on a Sovereign Core instance (OpenAPI 3.1).
Nothing else describes it:

- [`packages/api-client`](../../packages/api-client) is **generated** from it (`pnpm generate:api-client`), and a test
  fails if what is committed is not what the file produces.
- Core's own handlers are **tested against it**: each answer is checked against the schema of its operation, so a
  response that changes shape without this file changing fails CI, and so does a route this file does not describe.

An operation marked `x-planned: true` is part of the contract but not served yet; the tasks that serve it remove the
mark.

An operation marked `x-safe-to-repeat: true` changes nothing, so a client may send it again after a failure; every `GET` is
safe to repeat without the mark. The generated client says which are (`safeToRepeat`), and the SDK retries only those.

The rules (versioning, authentication, errors) are in the description at the top of the file. The behaviour behind
them is in [core-app §3.9 and §3.13](../../docs/specs/core-app.md).

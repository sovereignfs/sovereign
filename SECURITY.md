# Security Policy

## Reporting a vulnerability

**Do not file a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately using GitHub Security Advisories — only
repository maintainers can see your report:

### [Report a vulnerability →](https://github.com/sovereignfs/sovereign-core/security/advisories/new)

You will need a GitHub account. Your report remains private until we
coordinate disclosure together.

---

## Supported versions

Nothing has been released yet. Until the first release, only the `main` branch
is supported. Once releases exist, this section will name the versions that
receive security fixes.

---

## What to include

A useful report includes:

- A clear description of the vulnerability and its potential impact
- Steps to reproduce, ideally against a fresh instance of your own
- The commit or version, the deployment method (Docker or bare Node) and the
  database (sqld, PostgreSQL or a SQLite file)
- A suggested fix if you have one

---

## Scope

**In scope:**

- Authentication bypass, session hijacking or account takeover, including
  through email verification, password reset, invites, passkeys or two-factor
- Privilege escalation between roles, including reaching Console actions as a
  regular user, or an admin gaining owner-only capabilities
- Flaws in the OpenID Connect provider: redirect URI or PKCE bypass, an app
  receiving scopes or claims it was not granted (for example an untrusted app
  obtaining `roles`), consent that can be skipped, or tokens that keep working
  after an account is deactivated or access is removed
- Cross-user data exposure on a shared instance, including the Directory API
  revealing email addresses it should not
- Exposure of stored secrets (SMTP credentials, client secrets, signing keys)
- Cross-site scripting or other script injection in core's pages, or a
  weakened Content Security Policy
- Server-side request forgery through the logout notices core sends to an
  app's registered address
- Accounts or sessions discoverable through differences in responses

**Out of scope:**

- Issues requiring physical access to the host machine
- Vulnerabilities in the self-hoster's own infrastructure (reverse proxy
  misconfiguration, weak or exposed secrets, an open database port, and so on)
- Actions of a trusted operator: an owner or admin using the access they were
  given
- Issues in the apps that sign in through core — report those to the app's own
  repository
- Vulnerabilities in a dependency with no way to exploit them through core —
  report those upstream (we welcome a heads-up if core is affected)
- Denial of service by sheer volume of traffic
- Social engineering attacks

Please test only against an instance you run yourself, never against someone
else's.

---

## Response

We aim to:

- **Acknowledge** your report within **72 hours**
- **Provide an initial assessment** within **7 days**
- **Patch and disclose** critical vulnerabilities within **30 days**
  where possible, coordinating the disclosure timeline with you

We will credit you in the published advisory unless you prefer to remain
anonymous.

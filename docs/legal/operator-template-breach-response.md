---
title: 'Template: operator breach-response runbook'
description: A starting-point runbook for responding to a personal data breach on your instance — structure and a checklist, not legal advice. Fill in your own contacts and keep it for your own use; unlike PRIVACY.md/TOS.md, this is not meant to be published to your users.
aside: false
---

# Template — operator breach-response runbook

This is a skeleton, not legal advice — it gives you a structure to work from
when responding to a personal data breach, not a compliance guarantee.
Sovereign, the open-source project, cannot know your jurisdiction, your
user base, or the specifics of an incident, so every jurisdiction-specific
decision below (who your supervisory authority is, exact notification
deadlines beyond the one GDPR states directly, whether a given incident
legally qualifies as a "breach") is left for you to fill in or determine
with your own counsel.

Unlike [`operator-template-privacy.md`](operator-template-privacy.md) and
[`operator-template-terms.md`](operator-template-terms.md), this is **not**
meant to be published to your users — keep it as an internal runbook (a
private doc, a wiki page, wherever your own operational docs live), and fill
in the bracketed placeholders with your real contacts before you need it,
not during an incident.

---

# Data breach response runbook

Operated by **[Operator or Instance Name]**

## When to use this

A personal data breach is a security incident that leads to the accidental
or unlawful destruction, loss, alteration, unauthorized disclosure of, or
access to, personal data your instance holds — not just a confirmed leak.
If you're unsure whether something qualifies, treat it as one until you've
assessed it (below); the cost of a false alarm is far lower than the cost of
a missed one.

## Immediate response (first 24 hours)

- [ ] **Contain.** Stop the ongoing exposure — revoke a leaked credential
      (`SOVEREIGN_ADMIN_KEY`, `AUTH_SECRET`, database credentials, SMTP
      credentials, `SOVEREIGN_VAULT_KEY`/`SOVEREIGN_FIELD_KEK` if either may be
      compromised), take an exposed service offline, patch an exploited
      vulnerability, or revoke a compromised user session — whatever stops the
      incident from continuing while you assess it.
- [ ] **Preserve evidence before you clean up.** Copy relevant logs (server
      logs, Console's Activity log, database audit trails) somewhere durable
      before rotating credentials or restarting services wipes them. You'll need
      this to scope the incident accurately in the next step.
- [ ] **Assemble who needs to be involved** — whoever administers this
      instance, and legal/counsel if you have access to any, before you're
      deep into the next steps.

## Assess

- [ ] **What happened?** How did it happen, and is it still happening
      (contained in the step above, or ongoing)?
- [ ] **What data was involved?** Which tables, which apps, which users.
      Categorize it — account credentials, contact information, content users
      created, anything in this instance's field-encrypted or zero-knowledge
      classes (if either is configured — see Console → Settings → At-rest
      encryption) versus plaintext data.
- [ ] **How many people are affected?** An approximate count is enough to
      start; refine it as the picture clarifies.
- [ ] **What's the likely risk to those people?** Consider what someone with
      the exposed data could actually do with it — this drives both whether
      supervisory-authority notification is required and whether you also need
      to notify the affected people directly (see below).
- [ ] **Record a timeline** as you go: when the incident started (or your
      best estimate), when you became aware of it, and each action taken from
      here on, with timestamps. You'll need this for any notification and for
      your own record afterward.

## Notify

**GDPR Article 33** requires notifying the relevant supervisory authority
without undue delay and, where feasible, within 72 hours of becoming aware
of the breach — unless the breach is unlikely to result in a risk to
individuals' rights and freedoms. This is the regulation's own stated
deadline, not this project's advice; whether a specific incident meets that
bar, and which supervisory authority is "relevant" for your users, are
determinations for you and your counsel, not something Sovereign can
resolve generically.

- [ ] **Supervisory authority notification** (if required): **[your
      supervisory authority's name and notification channel]**. Note the date
      you became aware of the breach — that's what the 72-hour window measures
      from, not the date the breach itself started.
- [ ] **Affected-user notification** (if the breach is likely to result in a
      high risk to their rights and freedoms — **GDPR Article 34**): use the
      skeleton below as a starting point, adapted to the specific incident.
- [ ] Anyone else your own policies, contracts, or jurisdiction require —
      insurers, hosting/infrastructure providers, other data controllers you
      share data with, etc.

### Notification-letter skeleton

Adapt to the actual incident — don't send this unedited. Every bracket needs
a real, incident-specific answer.

> Subject: Important notice about your account on [Operator or Instance
> Name]
>
> We're writing to let you know about a security incident that affected
> your account on [Operator or Instance Name].
>
> **What happened:** [plain description of the incident]
>
> **What information was involved:** [the specific data categories affected
> for this recipient]
>
> **What we've done:** [containment and remediation steps already taken]
>
> **What we recommend you do:** [e.g., change your password, enable
> two-factor authentication, watch for phishing attempts referencing this
> incident]
>
> **Questions:** contact us at [Contact Email].

## After

- [ ] Rotate every credential that was exposed or plausibly exposed, not
      just the ones confirmed compromised.
- [ ] Apply whatever patch, config change, or process fix closes the actual
      root cause — not just the specific instance of it.
- [ ] Write up what happened, when, and what changed as a result, while it's
      still fresh — your own incident record, kept for your own accountability.
- [ ] Revisit this runbook: did it hold up, or does it need a fix before the
      next time?

## Contact

**[Contact Email]**.

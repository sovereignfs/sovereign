import { PageContainer, Typography } from '@sovereignfs/ui';
import { resolveInstanceName } from '@/src/instance-name';
import styles from '../legal-page.module.css';

// Default Privacy Policy served at /privacy. This is a template, not
// finished legal advice — the operator running this instance should have it
// reviewed for their jurisdiction, user base, and installed apps before
// relying on it. Every [BRACKETED] placeholder below must be filled in or
// removed before real users see this page. See docs/legal/operator-template-
// privacy.md in the platform source for the annotated version of this
// content and why each section says what it says.

export default function PrivacyPage() {
  const instanceName = resolveInstanceName(process.env.INSTANCE_NAME);

  return (
    <main className={styles.page}>
      <PageContainer maxWidth="md">
        <a href="/login" className={styles.back}>
          ← Back to sign in
        </a>
        <Typography variant="h1">Privacy Policy</Typography>
        <Typography variant="body" className={styles.meta}>
          Instance: {instanceName} · Operator: [OPERATOR NAME] · Contact: [OPERATOR CONTACT EMAIL] ·
          Effective date: [DATE]
        </Typography>

        <div className={styles.body}>
          <Typography variant="body">
            This instance runs <a href="https://github.com/sovereignfs/sovereign">Sovereign</a>, a
            self-hosted workspace platform. [Operator Name] operates this specific instance and is
            the data controller for the information described below. This is not a policy from the
            Sovereign open-source project — see the Sovereign project&rsquo;s own privacy policy for
            what the project itself (not this instance) does.
          </Typography>

          <section className={styles.section}>
            <Typography variant="h2">Who we are</Typography>
            <Typography variant="body">
              [Operator Name], reachable at [OPERATOR CONTACT EMAIL / ADDRESS], operates this
              Sovereign instance at [INSTANCE URL]. [Add jurisdiction / registered entity
              information if applicable — required in many jurisdictions, e.g. GDPR Art. 13.]
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Account information we collect</Typography>
            <Typography variant="body">When you register for an account, we collect:</Typography>
            <ul>
              <li>
                <strong>Email address</strong> and <strong>password</strong> (stored as a salted
                hash, never in plain text) — required to create and secure your account.
              </li>
              <li>
                <strong>Time zone</strong>, automatically detected from your browser at signup so
                your dates and reminders display correctly. You can change it any time in your
                account settings; it is never used for anything beyond formatting.
              </li>
            </ul>
            <Typography variant="body">
              We do not require your real name, phone number, or any other personal detail to create
              an account unless [Operator Name] has configured additional required fields —
              [describe here if applicable].
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Cookies and sessions</Typography>
            <Typography variant="body">
              Signing in sets a session cookie so you stay logged in, plus a short-lived (5 minute)
              signed cache of your session used to speed up page loads without extra server
              round-trips. We also set a small cookie to remember your light/dark theme preference.
              None of these cookies are used for advertising or cross-site tracking, and no
              third-party tracking cookies are set by the platform itself.
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Installing this instance as an app (PWA)</Typography>
            <Typography variant="body">
              You can install this instance to your device&rsquo;s home screen or desktop as a
              Progressive Web App. Installing doesn&rsquo;t grant any new permissions beyond normal
              browsing — the installed app cannot access your camera, microphone, or location unless
              a specific installed app on this instance requests it and you separately approve that
              request; by default, the platform blocks those permissions at the browser level.
            </Typography>
            <Typography variant="body">
              To make the installed app usable with a flaky connection, your browser caches some
              page content and static assets locally on your device (up to about a day for pages,
              longer for static assets), and keeps a small queue of actions you take while offline
              so it can sync them once you&rsquo;re back online. This instance is not fully
              offline-first — don&rsquo;t assume an action taken while offline is guaranteed to be
              saved or synced.
            </Typography>
            <Typography variant="body">
              <strong>
                Signing out clears this device&rsquo;s offline action queue and offline-page cache
              </strong>
              , but some other cached page content may persist in your browser&rsquo;s cache for up
              to a day afterward until it naturally expires. On a shared or public device, use your
              browser&rsquo;s &ldquo;clear site data&rdquo; option after signing out. [Operator
              Name: add specific guidance here if this instance is commonly used on shared or public
              devices.]
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Email</Typography>
            <Typography variant="body">
              We send you email only when necessary to operate your account: verifying your email
              address, resetting your password if you ask, and notifying you that your account was
              created. [Operator Name] sends this mail through [SMTP PROVIDER NAME] acting as our
              email delivery processor. We do not send marketing email unless you separately opt in.
              [Remove/adjust if this instance sends other transactional or notification email, e.g.
              from installed apps — list them here.]
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Where your data is stored</Typography>
            <Typography variant="body">
              Your account and content are stored in this instance&rsquo;s own database, hosted on
              infrastructure operated by [Operator Name] at [general hosting location / region if
              disclosed]. Data is [encrypted at rest / not encrypted at rest — Operator Name: state
              which applies to this instance]. We do not share instance data with the Sovereign
              open-source project — the project has no access to this instance.
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Installed apps</Typography>
            <Typography variant="body">
              This instance currently offers: [LIST INSTALLED APPS]. Each app may collect and store
              additional data specific to its function (for example, a task-tracking app stores your
              task lists; a notes app stores your notes). That data is stored in this same instance
              database, under the same account, and is not shared outside this instance except as
              described elsewhere in this policy. [Operator Name should list any app-specific data
              handling that goes beyond normal in-instance storage.]
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Native device access (mobile/desktop apps)</Typography>
            <Typography variant="body">
              If you use this instance through the Sovereign mobile or desktop app, some apps may
              request access to device capabilities (such as your camera or device storage) to
              provide their functionality. You&rsquo;ll be asked to approve each such request the
              first time an app asks for it, and you can review or revoke these approvals in your
              account settings at any time. [Update this section once device-capability apps are
              actually installed on this instance — remove if none are.]
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Push notifications</Typography>
            <Typography variant="body">
              If you enable push notifications, your browser or device registers a push subscription
              with [Operator Name]&rsquo;s server, which we use solely to deliver notifications
              you&rsquo;ve asked for. Delivery is routed through your browser&rsquo;s or
              device&rsquo;s push service (for example, a Google or Apple push service), which is a
              separate third party outside our control, subject to their own privacy terms.
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Your rights</Typography>
            <Typography variant="body">
              You can export your account data at any time from your account settings (Settings →
              Data → Export). You can permanently delete your account and its data from the same
              page; deletion removes your account and associated content across every installed app.
              [Operator Name: add any jurisdiction-specific rights language here — e.g. GDPR/CCPA
              rights, and how to exercise them if different from the built-in export/delete tools.]
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Retention</Typography>
            <Typography variant="body">
              We keep your account data for as long as your account exists. [Operator Name: state
              any additional retention/backup policy — e.g. how long deleted accounts persist in
              backups.]
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Children&rsquo;s privacy</Typography>
            <Typography variant="body">
              [Operator Name: state your policy — e.g. &ldquo;This instance is not directed at
              children under [age], and we do not knowingly collect data from them.&rdquo; Adjust to
              your actual audience and applicable law.]
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Changes to this policy</Typography>
            <Typography variant="body">
              We&rsquo;ll update the effective date above when this policy changes and let you know
              [describe notice method, e.g. &ldquo;by email&rdquo; or &ldquo;via an in-app
              notice&rdquo;] for material changes.
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Contact</Typography>
            <Typography variant="body">
              Questions about this policy or your data: [OPERATOR CONTACT EMAIL].
            </Typography>
          </section>
        </div>
      </PageContainer>
    </main>
  );
}

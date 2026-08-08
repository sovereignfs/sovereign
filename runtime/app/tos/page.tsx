import { PageContainer, Typography } from '@sovereignfs/ui';
import { resolveInstanceName } from '@/src/instance-name';
import styles from '../legal-page.module.css';

// Default Terms of Service served at /tos. This is a template, not
// finished legal advice — the operator running this instance should have it
// reviewed before relying on it. Every [BRACKETED] placeholder below must be
// filled in or removed before real users see this page. See
// docs/legal/operator-template-terms.md in the platform source for the
// annotated version of this content and why each section says what it does.

export default function TosPage() {
  const instanceName = resolveInstanceName(process.env.INSTANCE_NAME);

  return (
    <main className={styles.page}>
      <PageContainer maxWidth="md">
        <a href="/login" className={styles.back}>
          ← Back to sign in
        </a>
        <Typography variant="h1">Terms of Service</Typography>
        <Typography variant="body" className={styles.meta}>
          Instance: {instanceName} · Operator: [OPERATOR NAME] · Contact: [OPERATOR CONTACT EMAIL] ·
          Effective date: [DATE]
        </Typography>

        <div className={styles.body}>
          <Typography variant="body">
            These terms govern your use of the account and apps offered at [INSTANCE URL]
            (&ldquo;this instance&rdquo;), operated by [Operator Name]. This instance runs{' '}
            <a href="https://github.com/sovereignfs/sovereign">Sovereign</a>, open-source software;
            these terms are set by [Operator Name], not by the Sovereign project.
          </Typography>

          <section className={styles.section}>
            <Typography variant="h2">Eligibility and accounts</Typography>
            <Typography variant="body">
              [Operator Name: state eligibility, e.g. minimum age, invite-only vs. open registration
              — this instance&rsquo;s access policy is [ACCESS POLICY: open / approval required /
              invite only].] You&rsquo;re responsible for keeping your account credentials
              confidential and for activity under your account.
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Acceptable use</Typography>
            <Typography variant="body">
              You agree not to use this instance to: [Operator Name: list prohibited uses relevant
              to your community — e.g. illegal content, harassment, spam, attempting to access other
              users&rsquo; accounts or data, disrupting the service]. [Operator Name] may remove
              content or suspend accounts that violate this section.
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Your content</Typography>
            <Typography variant="body">
              You retain ownership of the content you create on this instance. By using this
              instance you grant [Operator Name] only the rights needed to store, back up, and
              display your content back to you and, where you choose to share it, to other users
              you&rsquo;ve shared it with. [Operator Name] does not claim ownership of your content
              and does not use it for purposes beyond operating the instance, except as described in
              the <a href="/privacy">Privacy Policy</a>.
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Installed apps</Typography>
            <Typography variant="body">
              The apps available on this instance may change over time as [Operator Name] adds,
              removes, or updates them. [Operator Name] will [describe notice practice, e.g.
              &ldquo;post a notice before removing an app you actively use&rdquo; — adjust to your
              actual practice].
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Availability</Typography>
            <Typography variant="body">
              [Operator Name] provides this instance on a best-effort basis and does not guarantee
              uptime, data durability beyond normal backup practices, or availability of any
              particular app. [Add an SLA here only if you actually offer one.]
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Suspension and termination</Typography>
            <Typography variant="body">
              [Operator Name] may suspend or terminate your account for violating these terms. You
              may delete your own account and data at any time from your account settings. [Operator
              Name: state notice practice for operator-initiated termination, and what happens to
              your data afterward.]
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">No warranty</Typography>
            <Typography variant="body">
              This instance and the underlying Sovereign software are provided &ldquo;as is.&rdquo;
              [Operator Name] disclaims warranties to the extent permitted by law. The Sovereign
              open-source project is not a party to this agreement and bears no responsibility for
              how [Operator Name] operates this instance.
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Limitation of liability</Typography>
            <Typography variant="body">
              To the maximum extent permitted by law, [Operator Name] is not liable for indirect,
              incidental, or consequential damages arising from your use of this instance. [Add
              jurisdiction-appropriate liability caps here — consult local counsel.]
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Changes to these terms</Typography>
            <Typography variant="body">
              We&rsquo;ll update the effective date above when these terms change and [describe
              notice method] for material changes. Continued use of this instance after a change
              means you accept the updated terms.
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Governing law</Typography>
            <Typography variant="body">
              [Operator Name: state governing law and jurisdiction for disputes.]
            </Typography>
          </section>

          <section className={styles.section}>
            <Typography variant="h2">Contact</Typography>
            <Typography variant="body">[OPERATOR CONTACT EMAIL].</Typography>
          </section>
        </div>
      </PageContainer>
    </main>
  );
}

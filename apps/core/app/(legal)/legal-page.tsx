import Link from 'next/link';
import { connection } from 'next/server';
import { Card, PageContainer } from '@sovereignfs/ui';
import type { LegalDocument } from '../../src/legal/content';
import styles from './legal.module.css';

/**
 * A legal document as a page. It is rendered on every request, not at build time: the policy that
 * protects the page needs a nonce that only a request has.
 */
export async function LegalPage({
  document,
  other,
}: {
  document: LegalDocument;
  /** The other document, linked at the foot. */
  other: { label: string; href: string };
}) {
  await connection();
  return (
    <PageContainer maxWidth="md">
      <Card padding="lg">
        <article className={styles.document}>
          <h1 className={styles.title}>{document.title}</h1>
          {document.intro.map((paragraph) => (
            <p key={paragraph} className={styles.text}>
              {paragraph}
            </p>
          ))}
          {document.sections.map((section) => (
            <section key={section.heading} className={styles.document}>
              <h2 className={styles.heading}>{section.heading}</h2>
              {section.blocks.map((block) =>
                typeof block === 'string' ? (
                  <p key={block} className={styles.text}>
                    {block}
                  </p>
                ) : (
                  <ul key={block.list.join('|')} className={styles.list}>
                    {block.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ),
              )}
            </section>
          ))}
          <p className={styles.footer}>
            <Link className={styles.link} href={other.href}>
              {other.label}
            </Link>
            <Link className={styles.link} href="/sign-in">
              Back to sign in
            </Link>
          </p>
        </article>
      </Card>
    </PageContainer>
  );
}

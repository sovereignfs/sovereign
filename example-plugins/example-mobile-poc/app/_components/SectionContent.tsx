'use client';

import { useState } from 'react';
import { Button, Card, Icon } from '@sovereignfs/ui';
import type { Section } from '../_lib/sections';
import styles from './SectionContent.module.css';

interface Props {
  section: Section;
}

/**
 * Shared dummy page body — rendered by app/[section]/page.tsx (desktop
 * content pane) and by MobileSectionCarousel's per-section slides (inside
 * SwipableMobileCarouselSlideBody). Deliberately static content with one
 * local-only UI event (the button below) — no fetch, no SDK call, no
 * persistence. See sections.ts.
 */
export default function SectionContent({ section }: Props) {
  const [tapped, setTapped] = useState(false);

  return (
    <Card padding="lg" className={styles.card}>
      <span className={styles.iconBadge} aria-hidden>
        <Icon name={section.icon} size="lg" aria-hidden />
      </span>
      <h1 className={styles.title}>{section.label}</h1>
      <p className={styles.body}>{section.body}</p>
      <Button size="sm" variant="secondary" onClick={() => setTapped(true)}>
        Dummy action
      </Button>
      {tapped && <p className={styles.hint}>Tapped — this POC has no data layer to affect.</p>}
    </Card>
  );
}

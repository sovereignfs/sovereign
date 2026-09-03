import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sdk } from '@sovereignfs/sdk';
import { PageContainer, PageHeader } from '@sovereignfs/ui';
import { NotificationDetailActions } from '../_components/NotificationDetailActions';
import styles from '../inbox.module.css';

const SELF_URL = `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;

interface NotificationDetail {
  id: string;
  title: string;
  body: string | null;
  summary: string | null;
  actionUrl: string | null;
  category: string;
  readAt: number | null;
  dismissedAt: number | null;
  createdAt: number;
}

async function getNotification(id: string): Promise<NotificationDetail | null> {
  const cookie = (await headers()).get('cookie') ?? '';
  const res = await fetch(`${SELF_URL}/api/account/notifications/${id}`, {
    headers: { cookie },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load notification: ${String(res.status)}`);
  const data = (await res.json()) as { notification: NotificationDetail };
  return data.notification;
}

/**
 * Notification detail (RFC 0048 §1) — full body, source/category/time,
 * primary action, mark read/dismiss. Body is always rendered as plain React
 * text content, never `dangerouslySetInnerHTML`, regardless of
 * `bodyFormat` — no markdown-to-HTML pipeline exists in this repo (see the
 * leg's plan file, decision 8). Metadata is not rendered in v1 — no real
 * field exists yet beyond the internal message-link, which is consumed
 * programmatically via `dedupeKey`, never displayed.
 */
export default async function NotificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await sdk.auth.requireSession();
  const { id } = await params;
  const notification = await getNotification(id);
  if (!notification) notFound();

  return (
    <PageContainer maxWidth="md">
      <Link href="/inbox" className={styles.help}>
        ‹ Inbox
      </Link>
      <PageHeader title={notification.title} />
      <div className={styles.detail}>
        <div className={styles.detailMeta}>
          <span>{notification.category}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={new Date(notification.createdAt * 1000).toISOString()}>
            {new Date(notification.createdAt * 1000).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </time>
        </div>
        {(notification.body ?? notification.summary) && (
          <p className={styles.detailBody}>{notification.body ?? notification.summary}</p>
        )}
        <NotificationDetailActions
          id={notification.id}
          readAt={notification.readAt}
          actionUrl={notification.actionUrl}
        />
      </div>
    </PageContainer>
  );
}

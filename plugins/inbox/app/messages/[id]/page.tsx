import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sdk } from '@sovereignfs/sdk';
import { PageContainer, PageHeader } from '@sovereignfs/ui';
import { MessageDetailActions } from '../../_components/MessageDetailActions';
import styles from '../../inbox.module.css';

const SELF_URL = `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;

interface MessageDetail {
  id: string;
  senderType: string;
  senderDisplay: string | null;
  subject: string;
  body: string;
  bodyFormat: string;
  createdAt: number;
  readAt: number | null;
  archivedAt: number | null;
}

async function getMessage(id: string): Promise<MessageDetail | null> {
  const cookie = (await headers()).get('cookie') ?? '';
  const res = await fetch(`${SELF_URL}/api/inbox/messages/${id}`, {
    headers: { cookie },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load message: ${String(res.status)}`);
  const data = (await res.json()) as { message: MessageDetail };
  return data.message;
}

function senderLabel(message: MessageDetail): string {
  if (message.senderDisplay) return message.senderDisplay;
  if (message.senderType === 'admin') return 'Admin';
  if (message.senderType === 'platform') return 'Sovereign';
  return 'App';
}

/**
 * Message detail (RFC 0048 §5) — subject/sender/time, full body, mark
 * read/unread, archive/unarchive, soft-delete with a confirm step. Fetching
 * this page auto-marks the message read and clears its linked notification
 * (`GET /api/inbox/messages/[id]`'s own side effect, RFC §3). Body is always
 * rendered as plain React text content, never `dangerouslySetInnerHTML`,
 * regardless of `bodyFormat` — no markdown-to-HTML pipeline exists in this
 * repo (see the leg's plan file, decision 8).
 */
export default async function MessageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await sdk.auth.requireSession();
  const { id } = await params;
  const message = await getMessage(id);
  if (!message) notFound();

  return (
    <PageContainer maxWidth="md">
      <Link href="/inbox?tab=messages" className={styles.help}>
        ‹ Inbox
      </Link>
      <PageHeader title={message.subject} description={`From ${senderLabel(message)}`} />
      <div className={styles.detail}>
        <div className={styles.detailMeta}>
          <time dateTime={new Date(message.createdAt * 1000).toISOString()}>
            {new Date(message.createdAt * 1000).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </time>
        </div>
        <p className={styles.detailBody}>{message.body}</p>
        <MessageDetailActions
          id={message.id}
          readAt={message.readAt}
          archivedAt={message.archivedAt}
        />
      </div>
    </PageContainer>
  );
}

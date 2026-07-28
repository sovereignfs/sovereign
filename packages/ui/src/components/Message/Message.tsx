import type { ReactNode } from 'react';
import styles from './Message.module.css';

export type MessageSender = 'user' | 'assistant' | 'tool';

export interface MessageProps {
  /** Matches the three roles Sovereign Harness stores per RFC 0040:
   * user, assistant, and tool messages. Named `sender`, not `role`, to
   * avoid colliding with the ARIA `role` attribute in JSX tooling. */
  sender: MessageSender;
  children?: ReactNode;
  /** Shows a "thinking" indicator instead of children — before the first
   * token of a streaming response arrives. Once content starts streaming
   * in, pass it as children and stop passing `pending`. */
  pending?: boolean;
  /** Rendered in a small row below the bubble — e.g. "Forget this" (RFC
   * 0040's per-message memory action), "Copy", "Regenerate". */
  actions?: ReactNode;
  className?: string;
}

/** Message — a single chat turn. Content is caller-controlled `ReactNode`
 * (markdown rendering, if any, is the consumer's choice, not baked in here). */
export function Message({ sender, children, pending, actions, className }: MessageProps) {
  return (
    <div className={[styles.row, styles[sender], className].filter(Boolean).join(' ')}>
      <div className={styles.bubble}>
        {pending ? (
          <span className={styles.typingDots} aria-label="Thinking">
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </span>
        ) : (
          children
        )}
      </div>
      {actions && !pending && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

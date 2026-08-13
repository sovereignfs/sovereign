import { ChatView } from './_components/ChatView';
import styles from './warden.module.css';

/**
 * Warden's routed chat page (RFC 0063, epic task 22.3). `data-plugin-fullbleed`
 * opts into the shell's hard-locked viewport height + zero padding
 * (`runtime/app/(platform)/shell.module.css`) so `ChatView`'s own internal
 * `MessageScroller` can rely on `height: 100%` cascading correctly instead
 * of the whole document scrolling as one unit.
 */
export default function WardenPage() {
  return (
    <div className={styles.page} data-plugin-fullbleed>
      <ChatView />
    </div>
  );
}

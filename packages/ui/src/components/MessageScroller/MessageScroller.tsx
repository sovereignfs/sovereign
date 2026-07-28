'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode, UIEvent } from 'react';
import styles from './MessageScroller.module.css';

export interface MessageScrollerProps {
  children: ReactNode;
  className?: string;
}

const NEAR_BOTTOM_THRESHOLD_PX = 80;

/**
 * MessageScroller — auto-scrolling chat container.
 *
 * Scrolls to the newest message automatically, but only while the user is
 * already near the bottom. If they've scrolled up to read history, new
 * content does not yank them back down — a "New messages" button appears
 * instead, matching the pattern every chat product (Slack, Discord,
 * ChatGPT) already uses.
 */
export function MessageScroller({ children, className }: MessageScrollerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // A ref, not state: reading the user's scroll position must not itself
  // retrigger the auto-scroll effect below, or scrolling back near the
  // bottom manually would immediately snap the container the rest of the
  // way — fighting the user's own scroll input.
  const isNearBottomRef = useRef(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      setHasNewMessages(false);
    } else {
      setHasNewMessages(true);
    }
  }, [children]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX;
    if (isNearBottomRef.current) {
      setHasNewMessages(false);
    }
  }

  function scrollToBottom() {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    isNearBottomRef.current = true;
    setHasNewMessages(false);
  }

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      <div className={styles.scrollContainer} ref={containerRef} onScroll={handleScroll}>
        {children}
      </div>
      {hasNewMessages && (
        <button type="button" className={styles.jumpButton} onClick={scrollToBottom}>
          New messages ↓
        </button>
      )}
    </div>
  );
}

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Icon, type IconName } from '../Icon/Icon';
import styles from './Toast.module.css';

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  /** `'info'` | `'success'` | `'warning'` | `'error'` | `'security'` | `'announcement'` */
  category?: string;
  /** Auto-dismiss delay in ms. Default 5000. Pass `0` to disable auto-dismiss. */
  duration?: number;
  exiting?: boolean;
}

export interface ToastContextValue {
  /** Show a toast notification. Returns the generated toast id. */
  show(item: Omit<ToastItem, 'id'>): string;
  /** Dismiss a toast by id. */
  dismiss(id: string): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Consume the toast context to imperatively show toasts from any client component. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast() must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const seedId = useId();
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 220);
  }, []);

  const show = useCallback(
    (item: Omit<ToastItem, 'id'>): string => {
      const id = `${seedId}-${++counter.current}`;
      const duration = item.duration ?? 5000;
      setToasts((prev) => [...prev, { ...item, id }]);
      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [seedId, dismiss],
  );

  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      currentTimers.forEach((t) => clearTimeout(t));
    };
  }, []);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ol
        className={styles.region}
        aria-label="Notifications"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} onDismiss={dismiss} />
        ))}
      </ol>
    </ToastContext.Provider>
  );
}

/** Maps toast category to a leading Icon name. */
const CATEGORY_ICON: Record<string, IconName> = {
  info: 'info',
  announcement: 'info',
  success: 'check',
  warning: 'alert-triangle',
  error: 'alert-triangle',
  security: 'alert-triangle',
};

function Toast({
  id,
  title,
  message,
  category = 'info',
  exiting,
  onDismiss,
}: ToastItem & { onDismiss(id: string): void }) {
  const categoryClass = styles[category as keyof typeof styles] ?? styles.info;
  const iconName = CATEGORY_ICON[category] ?? 'info';

  return (
    <li
      role="status"
      className={`${styles.toast} ${String(categoryClass)} ${exiting ? styles.exiting : ''}`}
    >
      <span className={styles.icon} aria-hidden="true">
        <Icon name={iconName} size="sm" aria-hidden />
      </span>
      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        {message && <div className={styles.message}>{message}</div>}
      </div>
      <button
        type="button"
        className={styles.close}
        aria-label="Dismiss notification"
        onClick={() => onDismiss(id)}
      >
        ✕
      </button>
    </li>
  );
}

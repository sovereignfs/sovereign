import type { ReactNode } from 'react';
import { Button } from 'react-email';

/** The one call-to-action every email has: a link, drawn as a button in the instance's colour. */
export function EmailButton({
  href,
  color,
  children,
}: {
  href: string;
  color: string;
  children: ReactNode;
}) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: color,
        color: '#ffffff',
        fontSize: 14,
        fontWeight: 600,
        padding: '12px 24px',
        borderRadius: 6,
        textDecoration: 'none',
      }}
    >
      {children}
    </Button>
  );
}

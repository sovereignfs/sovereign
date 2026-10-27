import type { ReactNode } from 'react';
import { Text } from 'react-email';

export function Lead({ children }: { children: ReactNode }) {
  return <Text style={{ fontSize: 15, color: '#18181b', margin: '0 0 16px' }}>{children}</Text>;
}

export function Note({ children, first = false }: { children: ReactNode; first?: boolean }) {
  return (
    <Text style={{ fontSize: 13, color: '#71717a', margin: first ? '20px 0 0' : '8px 0 0' }}>
      {children}
    </Text>
  );
}

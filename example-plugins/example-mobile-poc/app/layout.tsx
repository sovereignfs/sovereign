import type { ReactNode } from 'react';
import ExampleMobileShell from './_components/ExampleMobileShell';

export default function ExampleMobileLayout({ children }: { children: ReactNode }) {
  return <ExampleMobileShell>{children}</ExampleMobileShell>;
}

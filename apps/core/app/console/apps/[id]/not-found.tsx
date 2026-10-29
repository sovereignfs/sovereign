import Link from 'next/link';
import { EmptyState } from '@sovereignfs/ui';

export default function AppNotFound() {
  return (
    <EmptyState
      icon="layout-grid"
      heading="There is no such app"
      description="It may have been deleted."
      action={<Link href="/console/apps">Back to apps</Link>}
    />
  );
}

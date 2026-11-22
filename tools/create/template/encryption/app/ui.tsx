'use client';

// `@sovereignfs/ui` is one bundle with components that use React context, so a Server Component cannot import it directly. It is
// re-exported from here, a Client Component module, and pages import the parts they use from "./ui". They still render on the server.
export {
  Alert,
  AuthCard,
  AuthFooter,
  AuthLink,
  AuthNotice,
  BrandBadge,
  Button,
  ButtonLink,
  Card,
  Dialog,
  EmptyState,
  Input,
  LockedState,
  PageHeader,
  PushControl,
} from '@sovereignfs/ui';

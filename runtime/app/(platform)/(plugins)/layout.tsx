import type { ReactNode } from 'react';

/**
 * Layout for the `(plugins)` route group. It exists to host the `@modal`
 * parallel-route slot (RFC 0001) alongside the composed plugin pages, so an
 * overlay plugin's interception copy (`@modal/(.)<routePrefix>`) and its
 * full-page fallback (`<routePrefix>`) are folder-siblings within the same
 * group — the arrangement Next.js's `(.)` intercepting-route convention
 * requires. (Intercepting across the group boundary from the parent
 * `(platform)` layout fails with "initialTree is not iterable".)
 *
 * It is otherwise a pass-through: the platform shell (sidebar/header/footer)
 * comes from `(platform)/layout.tsx`; this layout adds no chrome.
 */
export default function PluginsLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}

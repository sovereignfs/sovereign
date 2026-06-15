/**
 * Fallback for the `@modal` parallel-route slot (RFC 0001). Rendered whenever no
 * overlay route is intercepted for the current URL — ordinary plugin pages and
 * any hard navigation. Renders nothing; the layout only shows the Dialog when an
 * overlay segment is actually active.
 */
export default function ModalDefault() {
  return null;
}

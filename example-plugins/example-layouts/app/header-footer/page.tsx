import { HeaderFooterDemo } from './_components/HeaderFooterDemo';

/**
 * Example: HeaderFooterLayout — reference plugin demonstrating
 * @sovereignfs/ui's HeaderFooterLayout: a fixed-height header, a scrollable
 * main region that claims whatever height is left, and a fixed-height
 * footer. Scroll the middle list to see the header/footer stay put while
 * only main moves — there's no position: fixed involved, it falls out of
 * plain flex layout.
 */
export default function HeaderFooterLayoutExamplePage() {
  return <HeaderFooterDemo />;
}

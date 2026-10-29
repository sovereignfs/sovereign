import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type Component = ((props: unknown) => unknown) & { constructor: { name: string } };

/**
 * Draws a page as the server would, for a test: a server component that is `async` (one that reads the instance,
 * the session or the database) is awaited and drawn in its place, and everything else is left to React. A plain
 * `renderToStaticMarkup` cannot draw an async component.
 */
async function expand(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map((child) => expand(child as ReactNode)));
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (
    typeof element.type === 'function' &&
    (element.type as Component).constructor.name === 'AsyncFunction'
  ) {
    return expand(await (element.type as (props: unknown) => Promise<ReactNode>)(element.props));
  }
  if (element.props.children === undefined) return element;
  const children = await expand(element.props.children);
  return cloneElement(element, undefined, ...Children.toArray(children));
}

export async function renderServer(node: ReactNode): Promise<string> {
  return renderToStaticMarkup((await expand(node)) as ReactElement);
}

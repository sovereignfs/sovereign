/**
 * Fills a box as a password manager can (AutoFill on iOS): the value is there to see, and the page is told nothing. The
 * prototype's setter is used because React watches the element's own.
 */
export function fillUnannounced(element: HTMLElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, value);
}

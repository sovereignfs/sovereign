import { IMAGE_MESSAGES, ImageError, MAX_IMAGE_BYTES } from './validate';

/**
 * Makes an SVG safe to keep and to serve (core-app §3.15). An SVG is a document: it can carry script, load
 * other addresses and reach other pages. This does not try to find what is dangerous in it. It reads the
 * document and writes a new one containing only what is known to be a picture: the shapes, paths, gradients,
 * text and clipping SVG draws with, and the presentation attributes that style them. Everything else is
 * dropped, an element together with what is inside it:
 *
 * - elements not on the list (`script`, `foreignObject`, `style`, `a`, `image`, `animate`, `set`, ...);
 * - attributes not on the list, so every `on...` handler, and any value that is not plain: `url(...)` may
 *   name only something in the same document (`#id`), and `href` likewise, so nothing is fetched;
 * - comments, processing instructions and CDATA outside of text.
 *
 * A document type declaration is refused outright (it is how entities are made to expand), as is a name with
 * a namespace prefix, a document that is not well formed, or one nested or large enough to be a nuisance.
 * The result is built from what was read, never copied through, so it is well formed whatever the input was,
 * and it is served as an image with `nosniff` and a policy that forbids script anyway (defence in depth).
 */
const MAX_DEPTH = 32;
const MAX_ELEMENTS = 5000;
const MAX_VALUE = 4096;

const ELEMENTS = new Set([
  'svg',
  'g',
  'defs',
  'symbol',
  'use',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'title',
  'desc',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
]);

/** Elements whose text is part of the picture (or its description) and is kept. */
const TEXT_ELEMENTS = new Set(['text', 'tspan', 'title', 'desc']);

const ATTRIBUTES = new Set([
  // geometry
  'd',
  'points',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'fx',
  'fy',
  'dx',
  'dy',
  'width',
  'height',
  'viewBox',
  'preserveAspectRatio',
  'transform',
  'pathLength',
  'refX',
  'refY',
  // structure
  'id',
  'version',
  'clip-path',
  'mask',
  'clipPathUnits',
  'maskUnits',
  'maskContentUnits',
  'patternUnits',
  'patternContentUnits',
  'patternTransform',
  // gradients
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'offset',
  // presentation
  'fill',
  'fill-opacity',
  'fill-rule',
  'clip-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'color',
  'stop-color',
  'stop-opacity',
  'visibility',
  'display',
  'overflow',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'text-anchor',
  'dominant-baseline',
  'text-decoration',
  'vector-effect',
  'shape-rendering',
]);

/** The properties a `style` attribute may carry: the presentation ones, with the same rules for values. */
const STYLE_PROPERTIES = new Set([
  'fill',
  'fill-opacity',
  'fill-rule',
  'clip-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'color',
  'stop-color',
  'stop-opacity',
  'visibility',
  'display',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'text-anchor',
]);

const ID = /^[A-Za-z_][\w.-]*$/;
const REFERENCE = /^#[A-Za-z_][\w.-]*$/;
const NAME = /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/;
// eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const bad = (): never => {
  throw new ImageError('bad-svg', IMAGE_MESSAGES['bad-svg']);
};

const ENTITY = /&(?:#x[0-9A-Fa-f]{1,6}|#[0-9]{1,7}|[A-Za-z]+);/g;

/** Text with its entities replaced: the five predefined, and numeric references to a character that may appear. */
function decode(text: string): string {
  return text.replace(ENTITY, (all) => {
    const body = all.slice(1, -1);
    if (body.startsWith('#')) {
      const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      const allowed =
        code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 0x20 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) && code !== 0x7f);
      return allowed ? String.fromCodePoint(code) : bad();
    }
    return ENTITIES[body] ?? bad();
  });
}

/** Text with its entities replaced, and refused if an `&` is left over that was not part of one. */
function plain(raw: string): string {
  if (raw.replace(ENTITY, '').includes('&')) bad();
  return decode(raw);
}

const escapeText = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttribute = (value: string): string =>
  escapeText(value)
    .replace(/"/g, '&quot;')
    .replace(/[\t\n\r]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Whether a presentation value is plain: it is short, has no control characters, and the only thing it can
 * point at is something in the same document. Anything that could fetch, run or escape is refused.
 */
function plainValue(value: string): boolean {
  if (value.length > MAX_VALUE || CONTROL.test(value)) return false;
  if (
    /[\\<>@]|\/\*|expression\s*\(|javascript:|data:|vbscript:|-moz-binding|behaviou?r\s*:/i.test(
      value,
    )
  ) {
    return false;
  }
  for (const found of value.matchAll(/url\s*\(([^)]*)\)/gi)) {
    const target = (found[1] ?? '')
      .trim()
      .replace(/^(["'])(.*)\1$/, '$2')
      .trim();
    if (!REFERENCE.test(target)) return false;
  }
  // any "url" that is not followed by its parenthesis is not one of ours to understand
  const withoutUrls = value.replace(/url\s*\([^)]*\)/gi, '');
  return !/url/i.test(withoutUrls);
}

/** A `style` attribute kept down to the presentation properties, or nothing when none survives. */
function styleOf(value: string): string | undefined {
  const kept: string[] = [];
  for (const declaration of value.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon === -1) continue;
    const name = declaration.slice(0, colon).trim().toLowerCase();
    const setting = declaration.slice(colon + 1).trim();
    if (STYLE_PROPERTIES.has(name) && setting !== '' && plainValue(setting)) {
      kept.push(`${name}:${setting}`);
    }
  }
  return kept.length > 0 ? kept.join(';') : undefined;
}

/** One attribute as it is kept, or `undefined` when it is dropped. */
function attributeOf(name: string, value: string): [string, string] | undefined {
  if (name === 'style') {
    const style = styleOf(value);
    return style === undefined ? undefined : ['style', style];
  }
  if (name === 'href' || name === 'xlink:href')
    return REFERENCE.test(value) ? ['href', value] : undefined;
  if (name === 'id') return ID.test(value) ? ['id', value] : undefined;
  if (!ATTRIBUTES.has(name) || !plainValue(value)) return undefined;
  return [name, value];
}

type Open = { name: string; keep: boolean };

/**
 * The safe form of an SVG document, or an `ImageError` (`bad-svg`) when it cannot be read as one. The result
 * is UTF-8 and begins with the `svg` element: the xmlns is always the SVG one.
 */
export function sanitiseSvg(bytes: Buffer): Buffer {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return bad();
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return bad();
  }
  source = source.replace(/^\uFEFF/, '');
  if (CONTROL.test(source)) return bad();

  const out: string[] = [];
  const stack: Open[] = [];
  let elements = 0;
  let rootSeen = false;
  let rootClosed = false;
  let at = 0;

  const skipping = () => stack.some((open) => !open.keep);
  const inTextElement = () => {
    const top = stack[stack.length - 1];
    return top !== undefined && top.keep && TEXT_ELEMENTS.has(top.name);
  };

  while (at < source.length) {
    if (source[at] !== '<') {
      const end = source.indexOf('<', at);
      const raw = source.slice(at, end === -1 ? source.length : end);
      at = end === -1 ? source.length : end;
      if (stack.length === 0) {
        if (raw.trim() !== '') return bad(); // text outside the root element
        continue;
      }
      if (!skipping() && inTextElement()) out.push(escapeText(plain(raw)));
      else plain(raw); // still has to be well formed
      continue;
    }
    if (source.startsWith('<!--', at)) {
      const end = source.indexOf('-->', at + 4);
      if (end === -1) return bad();
      if (source.slice(at + 4, end).includes('--')) return bad();
      at = end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', at)) {
      const end = source.indexOf(']]>', at + 9);
      if (end === -1 || stack.length === 0) return bad();
      if (!skipping() && inTextElement()) out.push(escapeText(source.slice(at + 9, end)));
      at = end + 3;
      continue;
    }
    if (source.startsWith('<?', at)) {
      // the XML declaration at the very start is allowed and dropped; no other instruction is
      const end = source.indexOf('?>', at + 2);
      if (end === -1) return bad();
      if (!(at === 0 && /^<\?xml[\s?]/.test(source.slice(at, end + 2)))) return bad();
      at = end + 2;
      continue;
    }
    if (source.startsWith('<!', at)) return bad(); // a document type declaration, or anything else of that kind

    if (source.startsWith('</', at)) {
      const end = source.indexOf('>', at);
      if (end === -1) return bad();
      const name = source.slice(at + 2, end).trim();
      const open = stack.pop();
      if (!open || open.name !== name) return bad();
      if (open.keep && !skipping()) out.push(`</${name}>`);
      if (stack.length === 0) rootClosed = true;
      at = end + 1;
      continue;
    }

    // an opening (or self-closing) tag
    const tag = /^<([^\s/>]+)/.exec(source.slice(at, at + 300));
    if (!tag || !NAME.test(tag[1] ?? '')) return bad();
    const name = tag[1] as string;
    let cursor = at + tag[0].length;
    const attributes = new Map<string, string>();
    let selfClosing = false;
    for (;;) {
      while (/\s/.test(source[cursor] ?? '')) cursor++;
      if (cursor >= source.length) return bad();
      if (source[cursor] === '>') {
        cursor++;
        break;
      }
      if (source.startsWith('/>', cursor)) {
        selfClosing = true;
        cursor += 2;
        break;
      }
      const attribute = /^([^\s=/>"'<]+)\s*=\s*/.exec(source.slice(cursor, cursor + 300));
      if (!attribute || !NAME.test(attribute[1] ?? '')) return bad();
      cursor += attribute[0].length;
      const quote = source[cursor];
      if (quote !== '"' && quote !== "'") return bad();
      const close = source.indexOf(quote, cursor + 1);
      if (close === -1) return bad();
      const raw = source.slice(cursor + 1, close);
      if (raw.includes('<')) return bad();
      const key = attribute[1] as string;
      if (attributes.has(key)) return bad(); // a repeated attribute is not well formed
      if (raw.length > MAX_VALUE * 4) return bad();
      attributes.set(key, plain(raw));
      cursor = close + 1;
    }
    at = cursor;

    if (rootClosed) return bad(); // a second root
    if (stack.length === 0) {
      if (name !== 'svg') return bad();
      rootSeen = true;
    }
    if (stack.length >= MAX_DEPTH) return bad();
    if (++elements > MAX_ELEMENTS) return bad();

    const keep = !skipping() && ELEMENTS.has(name);
    if (keep) {
      const written = [`<${name}`];
      if (name === 'svg' && stack.length === 0) written.push(' xmlns="http://www.w3.org/2000/svg"');
      for (const [key, value] of attributes) {
        const kept = attributeOf(key, value);
        if (kept) written.push(` ${kept[0]}="${escapeAttribute(kept[1])}"`);
      }
      out.push(selfClosing ? `${written.join('')}/>` : `${written.join('')}>`);
    }
    if (selfClosing) {
      if (stack.length === 0) rootClosed = true;
    } else {
      stack.push({ name, keep });
    }
  }
  if (stack.length > 0 || !rootSeen) return bad();

  const result = Buffer.from(out.join(''), 'utf8');
  if (result.length === 0 || result.length > MAX_IMAGE_BYTES) return bad();
  return result;
}

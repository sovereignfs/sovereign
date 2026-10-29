import { describe, expect, it } from 'vitest';
import { sanitiseSvg } from '../images/svg';
import { ImageError, MAX_IMAGE_BYTES } from '../images/validate';

const clean = (svg: string) => sanitiseSvg(Buffer.from(svg, 'utf8')).toString('utf8');
const refusal = (svg: string | Buffer) => {
  try {
    sanitiseSvg(typeof svg === 'string' ? Buffer.from(svg, 'utf8') : svg);
  } catch (error) {
    return error instanceof ImageError ? error.code : error;
  }
  return undefined;
};
const NS = 'xmlns="http://www.w3.org/2000/svg"';

describe('a plain picture', () => {
  it('keeps its shapes, geometry and presentation, and writes the SVG namespace itself', () => {
    expect(
      clean(
        '<svg viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" rx="2" fill="#123456" stroke="red" stroke-width="1"/><circle cx="5" cy="5" r="2"/></svg>',
      ),
    ).toBe(
      `<svg ${NS} viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" rx="2" fill="#123456" stroke="red" stroke-width="1"/><circle cx="5" cy="5" r="2"/></svg>`,
    );
  });

  it('replaces a namespace that is not the SVG one, so the output always has the right one', () => {
    expect(clean('<svg xmlns="http://evil.example/ns" width="1" height="1"/>')).toBe(
      `<svg ${NS} width="1" height="1"/>`,
    );
  });

  it('keeps paths, gradients, clipping, text and a use of something in the same document', () => {
    const out = clean(
      `<svg viewBox="0 0 10 10"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient><clipPath id="c"><path d="M0 0L10 0L10 10Z"/></clipPath></defs><g clip-path="url(#c)"><path d="M1 1h8v8z" fill="url(#g)"/></g><use href="#c"/><text x="1" y="9">Hi &amp; bye</text><title>Logo</title></svg>`,
    );
    for (const kept of [
      '<linearGradient id="g"',
      '<stop offset="1" stop-color="#000" stop-opacity=".5"/>',
      '<clipPath id="c">',
      'fill="url(#g)"',
      'clip-path="url(#c)"',
      '<use href="#c"/>',
      '<text x="1" y="9">Hi &amp; bye</text>',
      '<title>Logo</title>',
    ]) {
      expect(out).toContain(kept);
    }
  });

  it('accepts an XML declaration, a BOM, comments and whitespace around the picture, and writes none of them', () => {
    const out = clean(
      '﻿<?xml version="1.0" encoding="UTF-8"?>\n<!-- made by a tool -->\n<svg width="2" height="2">\n  <!-- a square -->\n  <rect width="2" height="2"/>\n</svg>\n',
    );
    expect(out).toBe(`<svg ${NS} width="2" height="2"><rect width="2" height="2"/></svg>`);
  });

  it('turns xlink:href into href, for a reference inside the document only', () => {
    expect(clean('<svg><use xlink:href="#a"/></svg>')).toContain('<use href="#a"/>');
  });

  it('reads attributes in single quotes and numeric character references', () => {
    expect(clean("<svg><text>&#65;&#x42;</text><rect fill='red'/></svg>")).toContain(
      '<text>AB</text><rect fill="red"/>',
    );
  });

  it('keeps a style only down to its presentation properties', () => {
    const out = clean(
      '<svg><rect style="fill:#abc;stroke-width:2;position:fixed;background:url(http://x.example/a)"/></svg>',
    );
    expect(out).toContain('style="fill:#abc;stroke-width:2"');
    expect(out).not.toMatch(/position|background|x\.example/);
  });

  it('writes no style at all when none of it survives', () => {
    expect(clean('<svg><rect style="position:fixed"/></svg>')).not.toContain('style=');
  });
});

describe('what can run or fetch', () => {
  it.each([
    ['a script element', '<svg><script>alert(1)</script><rect/></svg>', '<rect/>'],
    ['a script in a namespace', '<svg><svg:script>alert(1)</svg:script><rect/></svg>', '<rect/>'],
    ['a script in a different case', '<svg><SCRIPT>alert(1)</SCRIPT><rect/></svg>', '<rect/>'],
    ['a script in CDATA', '<svg><script><![CDATA[alert(1)]]></script><rect/></svg>', '<rect/>'],
    [
      'a foreignObject with a page in it',
      '<svg><foreignObject><body onload="alert(1)"><iframe src="javascript:alert(1)"/></body></foreignObject><rect/></svg>',
      '<rect/>',
    ],
    [
      'a style element',
      '<svg><style>@import url(http://evil.example/x.css);</style><rect/></svg>',
      '<rect/>',
    ],
    ['an image element', '<svg><image href="http://evil.example/x.png"/><rect/></svg>', '<rect/>'],
    [
      'an image of data',
      '<svg><image href="data:image/svg+xml;base64,PHN2Zy8+"/><rect/></svg>',
      '<rect/>',
    ],
    ['a link', '<svg><a href="javascript:alert(1)"><rect/></a></svg>', ''],
    [
      'an animation that sets an address',
      '<svg><rect><animate attributeName="href" to="javascript:alert(1)"/></rect></svg>',
      '<rect></rect>',
    ],
    [
      'a set element',
      '<svg><rect><set attributeName="onmouseover" to="alert(1)"/></rect></svg>',
      '<rect></rect>',
    ],
    ['an iframe', '<svg><iframe src="http://evil.example"/><rect/></svg>', '<rect/>'],
    ['an embed', '<svg><embed src="http://evil.example"/><rect/></svg>', '<rect/>'],
    [
      'a handler',
      '<svg onload="alert(1)"><rect onclick="alert(1)" onmouseover="alert(1)"/></svg>',
      '<rect/>',
    ],
    ['a handler in another case', '<svg><rect OnClick="alert(1)"/></svg>', '<rect/>'],
  ])('removes %s', (_name, input, expectedBody) => {
    const out = clean(input);
    expect(out).not.toMatch(
      /script|alert|javascript|evil|onload|onclick|onmouseover|foreignObject|iframe|embed|animate|import|<a[ >]/i,
    );
    expect(out).toContain(expectedBody);
  });

  it('removes an element together with everything inside it', () => {
    const out = clean(
      '<svg><g><foreignObject><g><rect id="inner"/></g></foreignObject></g><rect id="after"/></svg>',
    );
    expect(out).toBe(`<svg ${NS}><g></g><rect id="after"/></svg>`);
  });

  it.each([
    'javascript:alert(1)',
    ' javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'http://evil.example/a.svg#x',
    '//evil.example/a.svg#x',
    'a.svg#x',
    '#a b',
    '#',
    '',
  ])('drops a use or a link whose address is %j', (address) => {
    const out = clean(`<svg><use href="${address.replace(/"/g, '&quot;')}"/></svg>`);
    expect(out).toBe(`<svg ${NS}><use/></svg>`);
  });

  it.each([
    'url(http://evil.example/a.svg#x)',
    'url("http://evil.example/a.svg#x")',
    "url('//evil.example/x')",
    'url(data:image/svg+xml;base64,AAAA)',
    'url(javascript:alert(1))',
    'URL(http://evil.example/a)',
    'url( http://evil.example/a )',
    'red url(http://evil.example/a)',
    'url(#a) url(http://evil.example/a)',
    'url',
    'u\\72l(http://evil.example)',
    'expression(alert(1))',
    'javascript:alert(1)',
    'red /* url(http://evil.example) */',
  ])('drops a fill whose value is %j', (value) => {
    const out = clean(`<svg><rect fill="${value.replace(/"/g, '&quot;')}" stroke="#000"/></svg>`);
    expect(out).toBe(`<svg ${NS}><rect stroke="#000"/></svg>`);
  });

  it('allows a fill that points into the same document, in the forms SVG writes it', () => {
    for (const value of ['url(#a)', 'url("#a")', "url('#a')", 'url( #a ) red']) {
      expect(clean(`<svg><rect fill="${value.replace(/"/g, '&quot;')}"/></svg>`)).toContain(
        '<rect fill=',
      );
    }
  });

  it('drops a style declaration that fetches, as it drops one that is not a presentation property', () => {
    const out = clean(
      '<svg><rect style="fill:url(http://evil.example/a);stroke:red;behavior:url(x.htc);-moz-binding:url(x)"/></svg>',
    );
    expect(out).toContain('style="stroke:red"');
    expect(out).not.toMatch(/evil|behavior|binding/);
  });

  it('keeps an id only when it is a plain name, and nothing it could use to reach out', () => {
    expect(clean('<svg><rect id="ok-1.a"/></svg>')).toContain('id="ok-1.a"');
    expect(clean('<svg><rect id="a b"/></svg>')).not.toContain('id=');
    expect(clean('<svg><rect id="a&quot; onload=&quot;alert(1)"/></svg>')).not.toContain('onload');
  });

  it('writes what it keeps escaped, so a value cannot close its own attribute or tag', () => {
    const out = clean(
      '<svg><text>&lt;script&gt;alert(1)&lt;/script&gt;</text><rect fill="a&quot;b"/></svg>',
    );
    expect(out).toContain('<text>&lt;script&gt;alert(1)&lt;/script&gt;</text>');
    expect(out).not.toContain('<script>');
  });

  it('writes the text of a kept text element only, and drops text anywhere else', () => {
    const out = clean(
      '<svg>loose<g>also loose<text>kept</text></g></svg>'.replace('loose<g>', ' <g>'),
    );
    expect(out).toContain('<text>kept</text>');
    expect(out).not.toContain('loose');
  });

  it('never lets a drop-listed element come back by nesting it inside a kept one', () => {
    const out = clean('<svg><text><script>alert(1)</script>x</text></svg>');
    expect(out).toBe(`<svg ${NS}><text>x</text></svg>`);
  });
});

describe('what it will not read', () => {
  it.each([
    ['nothing', ''],
    ['text', 'hello'],
    ['a document that is not SVG', '<html><body/></html>'],
    ['an SVG in a namespace prefix', '<svg:svg xmlns:svg="http://www.w3.org/2000/svg"/>'],
    ['a document type declaration', '<!DOCTYPE svg><svg/>'],
    [
      'entities declared in a document type',
      '<!DOCTYPE svg [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><svg><text>&b;</text></svg>',
    ],
    [
      'an external entity',
      '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg><text>&x;</text></svg>',
    ],
    ['an entity that was never declared', '<svg><text>&nbsp;</text></svg>'],
    ['a bare ampersand', '<svg><text>a & b</text></svg>'],
    ['an unclosed element', '<svg><g></svg>'],
    ['a mismatched end tag', '<svg><g></rect></svg>'],
    ['an element that never ends', '<svg><g>'],
    ['two roots', '<svg/><svg/>'],
    ['text after the root', '<svg/>trailing'],
    ['an unquoted attribute', '<svg><rect width=1/></svg>'],
    ['a repeated attribute', '<svg><rect width="1" width="2"/></svg>'],
    ['a processing instruction', '<svg><?php echo 1 ?></svg>'],
    ['a stylesheet instruction', '<?xml-stylesheet href="http://evil.example/x.css"?><svg/>'],
    ['an unterminated comment', '<svg><!-- oops </svg>'],
    ['a comment with a double dash', '<svg><!-- a -- b --></svg>'],
    ['an unterminated attribute', '<svg><rect width="1/></svg>'],
    ['a "<" in an attribute', '<svg><rect width="<1"/></svg>'],
    ['a character that XML does not allow', '<svg><text>&#0;</text></svg>'],
    ['a character reference past Unicode', '<svg><text>&#x110000;</text></svg>'],
    ['a surrogate', '<svg><text>&#xD800;</text></svg>'],
    ['a control character', '<svg><text>\u0001</text></svg>'],
    ['CDATA outside the root', '<![CDATA[x]]><svg/>'],
    ['a name that is not one', '<svg><1bad/></svg>'],
  ])('refuses %s', (_name, input) => {
    expect(refusal(input)).toBe('bad-svg');
  });

  it('refuses bytes that are not UTF-8, and a UTF-16 document', () => {
    expect(
      refusal(
        Buffer.from([0x3c, 0x73, 0x76, 0x67, 0x3e, 0xff, 0xfe, 0x3c, 0x2f, 0x73, 0x76, 0x67, 0x3e]),
      ),
    ).toBe('bad-svg');
    expect(refusal(Buffer.from('<svg/>', 'utf16le'))).toBe('bad-svg');
  });

  it('refuses an empty file and one past the size limit', () => {
    expect(refusal(Buffer.alloc(0))).toBe('bad-svg');
    expect(refusal(Buffer.from(`<svg>${' '.repeat(MAX_IMAGE_BYTES)}</svg>`))).toBe('bad-svg');
  });

  it('refuses nesting deep enough to be a nuisance, and accepts what is reasonable', () => {
    const nested = (depth: number) => `<svg>${'<g>'.repeat(depth)}${'</g>'.repeat(depth)}</svg>`;
    expect(refusal(nested(10))).toBeUndefined();
    expect(refusal(nested(40))).toBe('bad-svg');
  });

  it('refuses a picture made of far too many elements, and accepts a busy one', () => {
    const many = (n: number) => `<svg>${'<rect/>'.repeat(n)}</svg>`;
    expect(refusal(many(4000))).toBeUndefined();
    expect(refusal(many(6000))).toBe('bad-svg');
  });

  it('refuses an attribute value that is absurdly long, and drops a plain one that is merely too long', () => {
    expect(refusal(`<svg><rect fill="${'a'.repeat(20000)}"/></svg>`)).toBe('bad-svg');
    expect(clean(`<svg><rect fill="${'a'.repeat(5000)}"/></svg>`)).toBe(`<svg ${NS}><rect/></svg>`);
  });

  it('says the same thing whatever was wrong, in words the person can act on', () => {
    try {
      sanitiseSvg(Buffer.from('<svg>'));
    } catch (error) {
      expect((error as Error).message).toBe(
        'That SVG could not be read as a picture. Export it again as plain SVG, or use a PNG, JPEG or WebP picture.',
      );
    }
  });
});

describe('the result', () => {
  it('is the same when it is sanitised again', () => {
    const once = clean(
      '<svg viewBox="0 0 4 4"><script>x</script><g fill="red"><path d="M0 0h4v4z" style="stroke:#000"/><text>a &amp; b</text></g></svg>',
    );
    expect(clean(once)).toBe(once);
  });

  it('is always well formed, whatever the picture had in it', () => {
    const out = clean(
      '<svg><g><foreignObject><b></foreignObject></g></svg>'.replace('<b>', '<b/>'),
    );
    expect(out).toBe(`<svg ${NS}><g></g></svg>`);
  });
});

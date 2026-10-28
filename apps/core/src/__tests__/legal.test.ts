import { describe, expect, it } from 'vitest';
import { PRIVACY, TERMS, type LegalDocument } from '../legal/content';
import { legalVersion } from '../legal/version';

const textOf = (document: LegalDocument): string =>
  [
    document.title,
    ...document.intro,
    ...document.sections.flatMap((section) => [
      section.heading,
      ...section.blocks.flatMap((block) => (typeof block === 'string' ? [block] : block.list)),
    ]),
  ].join('\n');

describe('the default legal documents', () => {
  it('are a Privacy Policy and Terms of Service, each with sections to read', () => {
    expect(PRIVACY.title).toBe('Privacy Policy');
    expect(TERMS.title).toBe('Terms of Service');
    for (const document of [PRIVACY, TERMS]) {
      expect(document.intro.length).toBeGreaterThan(0);
      expect(document.sections.length).toBeGreaterThan(3);
      const headings = document.sections.map((section) => section.heading);
      expect(new Set(headings).size).toBe(headings.length);
    }
  });

  it('say what the software keeps, including the time zone and the acceptance', () => {
    const text = textOf(PRIVACY);
    expect(text).toMatch(/time zone/i);
    expect(text).toMatch(/accepted the Terms of Service/);
    expect(text).toMatch(/hash/);
  });

  it('name no operator, no jurisdiction and no particular app', () => {
    const text = `${textOf(PRIVACY)}\n${textOf(TERMS)}`;
    expect(text).not.toMatch(/fjord/i);
    expect(text).not.toMatch(/\[[A-Z ]+\]/);
    expect(text).not.toMatch(/governing law|jurisdiction of/i);
  });
});

describe('the version of the legal text', () => {
  it('is a digest, the same every time', () => {
    expect(legalVersion).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when a single word does, so no version number can be forgotten', async () => {
    const { createHash } = await import('node:crypto');
    const digest = (privacy: LegalDocument) =>
      createHash('sha256')
        .update(JSON.stringify([privacy, TERMS]))
        .digest('hex');
    expect(digest(PRIVACY)).toBe(legalVersion);
    const edited = { ...PRIVACY, intro: [`${PRIVACY.intro[0]} `, ...PRIVACY.intro.slice(1)] };
    expect(digest(edited)).not.toBe(legalVersion);
  });
});

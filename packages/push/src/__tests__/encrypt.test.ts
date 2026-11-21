import { describe, expect, it } from 'vitest';
import { EncryptionError, encryptPush, encryptWith } from '../encrypt';
import { keyPairOf } from '../keys';
import { decryptAsBrowser } from './browser-side';

// RFC 8291 §5 and Appendix A, copied from the RFC's text (whitespace removed).
const RFC = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPublic:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  ecdhSecret: 'kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs',
  ikm: 'S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg',
  prk: '09_eUZGrsvxChDCGRCdkLiDXrReGOEVeSCdCcPBSJSc',
  cek: 'oIhVW04MRdy2XN9CiKLxTg',
  nonce: '4h_95klXJ5E_qnoN',
  header:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

const b = (text: string) => new Uint8Array(Buffer.from(text, 'base64url'));
const t = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');

describe('encryption (RFC 8291)', () => {
  it('reproduces the worked example of Appendix A byte for byte', () => {
    const { body, intermediates } = encryptWith(
      b(RFC.plaintext),
      { publicKey: b(RFC.uaPublic), authSecret: b(RFC.auth) },
      { privateKey: b(RFC.asPrivate), salt: b(RFC.salt) },
    );
    expect(t(intermediates.ecdhSecret)).toBe(RFC.ecdhSecret);
    expect(t(intermediates.ikm)).toBe(RFC.ikm);
    expect(t(intermediates.prk)).toBe(RFC.prk);
    expect(t(intermediates.cek)).toBe(RFC.cek);
    expect(t(intermediates.nonce)).toBe(RFC.nonce);
    expect(t(intermediates.header)).toBe(RFC.header);
    expect(t(body)).toBe(RFC.body);
    // 86 bytes of header, 41 of message, the delimiter and the 16-byte tag. (§5 says `Content-Length: 145`, one too many.)
    expect(body.length).toBe(144);
  });

  it("derives the example sender's public key from its private key", () => {
    expect(keyPairOf(RFC.asPrivate)?.publicKey).toBe(RFC.asPublic);
  });

  it('is read by a browser with its keys, and differs every time', () => {
    const receiver = { publicKey: b(RFC.uaPublic), authSecret: b(RFC.auth) };
    const one = encryptPush(new TextEncoder().encode('{"title":"Hello"}'), receiver);
    const two = encryptPush(new TextEncoder().encode('{"title":"Hello"}'), receiver);
    expect(t(one)).not.toBe(t(two));
    const browser = { privateKey: b(RFC.uaPrivate), publicKey: b(RFC.uaPublic), auth: b(RFC.auth) };
    expect(decryptAsBrowser(one, browser)).toBe('{"title":"Hello"}');
    expect(decryptAsBrowser(b(RFC.body), browser)).toBe(
      'When I grow up, I want to be a watermelon',
    );
  });

  it('refuses keys of the wrong shape and a point off the curve', () => {
    const plain = new Uint8Array([1]);
    expect(() =>
      encryptPush(plain, { publicKey: new Uint8Array(65), authSecret: b(RFC.auth) }),
    ).toThrow(EncryptionError);
    const offCurve = b(RFC.uaPublic);
    offCurve[64] = (offCurve[64] ?? 0) ^ 1;
    expect(() => encryptPush(plain, { publicKey: offCurve, authSecret: b(RFC.auth) })).toThrow(
      EncryptionError,
    );
    expect(() =>
      encryptPush(plain, { publicKey: b(RFC.uaPublic), authSecret: new Uint8Array(15) }),
    ).toThrow(EncryptionError);
    expect(() =>
      encryptPush(new Uint8Array(3994), { publicKey: b(RFC.uaPublic), authSecret: b(RFC.auth) }),
    ).toThrow(EncryptionError);
  });
});

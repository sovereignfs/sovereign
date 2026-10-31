import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Refused } from '../errors.js';
import { bootstrapScript } from './bootstrap-script.js';
import { WRAPPER, WRAPPER_PATH, authorizedKeysLine } from './wrapper.js';

const image = `ghcr.io/sovereignfs/cli:0.1.0@sha256:${'a'.repeat(64)}`;
const key = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl';

/** Whether a shell reads the text as a program, without running it. */
function parses(text: string): boolean {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sv-sh-'));
  try {
    const file = path.join(dir, 'script.sh');
    writeFileSync(file, text);
    execFileSync('sh', ['-n', file]);
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('the script that prepares a machine', () => {
  it('is a program a shell reads, with and without a deployment key', () => {
    expect(parses(bootstrapScript({ image }))).toBe(true);
    expect(parses(bootstrapScript({ image, deployKey: key, rotate: true }))).toBe(true);
  });

  it('puts in only an image by digest and an ed25519 public key, so nothing in the repository becomes more than a word of it', () => {
    for (const bad of ["x'; id; '", 'ghcr.io/x:1', `a b@sha256:${'a'.repeat(64)}`]) {
      expect(() => bootstrapScript({ image: bad }), bad).toThrow(Refused);
    }
    for (const bad of ["ssh-ed25519 AAAA'; id #", 'ssh-rsa AAAA', `${key}\nssh-ed25519 BBBB`]) {
      expect(() => bootstrapScript({ image, deployKey: bad }), bad).toThrow(Refused);
    }
  });

  it('limits the deployment key to the wrapper, with no shell, terminal or forwarding, and gives a user no more than that', () => {
    const script = bootstrapScript({ image, deployKey: key });
    expect(script).toContain(`restrict,command=\\"${WRAPPER_PATH} --deploy-only\\"`);
    expect(authorizedKeysLine(key)).toBe(
      `restrict,command="${WRAPPER_PATH} --deploy-only" ${key} sovereign-deploy`,
    );
    expect(script).toContain('chmod 700 "$STATE/$dir"');
  });

  it('installs the wrapper whole, and the wrapper is a program a shell reads that passes the request on as one argument', () => {
    expect(bootstrapScript({ image })).toContain(WRAPPER);
    expect(parses(WRAPPER)).toBe(true);
    expect(WRAPPER).toContain('-- "$request"');
    expect(WRAPPER).not.toMatch(/\beval\b/);
  });

  it('asks for the key to be replaced only when told, and says it installs none when there is no key', () => {
    expect(bootstrapScript({ image, deployKey: key })).toContain("ROTATE='0'");
    expect(bootstrapScript({ image, deployKey: key, rotate: true })).toContain("ROTATE='1'");
    expect(bootstrapScript({ image })).toContain("DEPLOY_KEY=''");
  });
});

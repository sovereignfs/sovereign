import { describe, expect, it } from 'vitest';
import { run, type Io } from '../command';
import { dockerArgs, labelValue } from '../label';
import { manifestOf } from './helpers';

/** The command with a folder of files, and what it printed. */
function command(files: Record<string, string>, argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = {
    cwd: '/app',
    read: (path) => files[path],
    join: (...parts) => parts.join('/'),
    out: (text) => out.push(text),
    err: (text) => err.push(text),
  };
  const code = run(argv, io);
  return { code, out: out.join(''), err: err.join('') };
}
const file = (manifest: unknown) => ({ '/app/sovereign.manifest.json': JSON.stringify(manifest) });

describe('sovereign-manifest', () => {
  it('checks a valid manifest in the folder it is run in', () => {
    const result = command(file(manifestOf()), ['check']);
    expect(result).toEqual({
      code: 0,
      out: '/app/sovereign.manifest.json is a valid manifest 1.\n',
      err: '',
    });
  });

  it('reads the folder it is given', () => {
    const result = command({ '/web/sovereign.manifest.json': JSON.stringify(manifestOf()) }, [
      'check',
      '/web',
    ]);
    expect(result.code).toBe(0);
  });

  it('prints the label’s value, and the arguments for a build', () => {
    const manifest = manifestOf();
    expect(command(file(manifest), ['label']).out).toBe(`${labelValue(manifest)}\n`);
    expect(command(file(manifest), ['docker-args']).out).toBe(`${dockerArgs(manifest)}\n`);
    expect(command(file(manifest), ['docker-args', '--format', 'github']).out).toBe(
      `${dockerArgs(manifest, 'github')}\n`,
    );
  });

  it('prints nothing on stdout for a manifest that is not valid, and lists each problem on stderr', () => {
    for (const argv of [['check'], ['label'], ['docker-args']]) {
      const result = command(file(manifestOf({ port: 0, extra: 1 })), argv);
      expect(result.code).toBe(1);
      expect(result.out).toBe('');
      expect(result.err).toContain('is not a valid manifest');
      expect(result.err).toContain('port:');
      expect(result.err).toContain('extra is not allowed');
    }
  });

  it('says when there is no file, or it is not JSON', () => {
    expect(command({}, ['check'])).toMatchObject({ code: 1, out: '' });
    expect(command({}, ['check']).err).toContain('cannot be read');
    const notJson = command({ '/app/sovereign.manifest.json': 'nope' }, ['check']);
    expect(notJson).toMatchObject({ code: 1 });
    expect(notJson.err).toContain('is not JSON');
  });

  it.each([
    [[], 'Usage'],
    [['build'], 'Unknown command: build'],
    [['check', '--fast'], 'Unknown option: --fast'],
    [['check', 'a', 'b'], 'One folder at most'],
    [['docker-args', '--format', 'yaml'], 'shell or github'],
    [['docker-args', '--format'], 'shell or github'],
    [['check', '--format', 'shell'], 'Unknown option: --format'],
  ])('is a usage error for %j', (argv, message) => {
    const result = command(file(manifestOf()), argv);
    expect(result.code).toBe(2);
    expect(result.err).toContain(message);
  });

  it('prints its usage for --help, and succeeds', () => {
    expect(command({}, ['--help'])).toMatchObject({ code: 0 });
    expect(command({}, ['--help']).out).toContain('docker-args');
  });
});

import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { ALL_JOBS, classify, toOutput, type Jobs } from '../ci-changes';

const NONE: Jobs = {
  format: false,
  lint: false,
  typecheck: false,
  test: false,
  build: false,
  db: false,
  audit: false,
};

describe('classify', () => {
  it('runs nothing for a documentation-only change', () => {
    expect(
      classify([
        'README.md',
        'docs/specs/core-app.md',
        'docs/epics/identity-auth.md',
        'LICENSE',
        'MANIFESTO',
        '.github/ISSUE_TEMPLATE/bug_report.yml',
        '.github/PULL_REQUEST_TEMPLATE.md',
      ]),
    ).toEqual(NONE);
  });

  it('runs the code jobs, but not the audit, for a source change', () => {
    expect(classify(['scripts/check-doc-links.ts'])).toEqual({ ...ALL_JOBS, audit: false });
  });

  it('runs the code jobs when documentation and code change together', () => {
    expect(classify(['docs/specs/core-app.md', 'scripts/lib/doc-links.ts'])).toEqual({
      ...ALL_JOBS,
      audit: false,
    });
  });

  it('treats the agent skills as code, because a test guards that the two copies match', () => {
    const jobs = classify(['.agents/skills/sv-verify/SKILL.md']);
    expect(jobs.test).toBe(true);
    expect(classify(['.claude/skills/sv-verify/SKILL.md']).test).toBe(true);
  });

  it('runs the audit when a manifest or the lockfile changes', () => {
    expect(classify(['pnpm-lock.yaml']).audit).toBe(true);
    expect(classify(['package.json']).audit).toBe(true);
    expect(classify(['pnpm-workspace.yaml']).audit).toBe(true);
    expect(classify(['packages/config/package.json']).audit).toBe(true);
    expect(classify(['apps/core/package.json']).audit).toBe(true);
  });

  it('runs the database legs for packages, apps and scripts but not for tooling config', () => {
    expect(classify(['packages/database/src/client.ts']).db).toBe(true);
    expect(classify(['apps/core/src/auth.ts']).db).toBe(true);
    expect(classify(['scripts/__tests__/x.db.test.ts']).db).toBe(true);
    expect(classify(['eslint.config.ts']).db).toBe(false);
    expect(classify(['prettier.config.ts']).db).toBe(false);
    expect(classify(['.editorconfig']).db).toBe(false);
  });

  it('runs everything when the CI definition itself changes', () => {
    expect(classify(['.github/workflows/ci.yml'])).toEqual(ALL_JOBS);
    expect(classify(['.github/actions/setup/action.yml'])).toEqual(ALL_JOBS);
  });

  it('runs everything for a file it does not recognise, rather than skip something', () => {
    expect(classify(['mystery.bin'])).toEqual({ ...ALL_JOBS, audit: false });
  });

  it('runs everything when the list of changed files is empty', () => {
    expect(classify([])).toEqual(ALL_JOBS);
  });

  it('ignores blank lines in the list', () => {
    expect(classify(['', 'README.md', ''])).toEqual(NONE);
  });

  it('does not treat a markdown file inside a skill directory as documentation', () => {
    expect(classify(['.agents/skills/sv-ui-design/references/x.md']).test).toBe(true);
  });
});

describe('toOutput', () => {
  it('writes one name=value line per job, in the form GITHUB_OUTPUT expects', () => {
    expect(toOutput({ ...NONE, lint: true })).toBe(
      [
        'format=false',
        'lint=true',
        'typecheck=false',
        'test=false',
        'build=false',
        'db=false',
        'audit=false',
      ].join('\n') + '\n',
    );
  });
});

describe('the script as CI runs it, under plain Node', () => {
  const run = (args: string[], input?: string) =>
    execFileSync(process.execPath, ['--no-warnings', 'scripts/ci-changes.ts', ...args], {
      input,
      encoding: 'utf8',
    });

  it('reads the changed files from stdin', () => {
    const out = run([], 'docs/a.md\nREADME.md\n');
    expect(out).toContain('test=false');
    expect(out).toContain('audit=false');
  });

  it('turns a code change into the code jobs', () => {
    const out = run([], 'scripts/lib/doc-links.ts\n');
    expect(out).toContain('test=true');
    expect(out).toContain('db=true');
    expect(out).toContain('audit=false');
  });

  it('runs everything with --all, for events that are not a pull request', () => {
    const out = run(['--all']);
    for (const job of Object.keys(ALL_JOBS)) expect(out).toContain(`${job}=true`);
  });
});

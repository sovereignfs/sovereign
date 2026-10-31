import { RELEASE } from '../release.js';

/** Where the instance repository keeps the workflow that deploys it, and where the reusable one it calls lives (operator-cli §8.2). */
export const DEPLOY_WORKFLOW = '.github/workflows/deploy.yml';
export const REUSABLE = 'sovereignfs/sovereign/.github/workflows/deploy.yml';

/**
 * The thin workflow of an instance repository that deploys from GitHub. It holds nothing but the call, pinned to the toolkit's version, and
 * the one secret the call is given: the deployment key, which can send a deployment and do nothing else. A runner has no key that opens
 * `secrets.age.yml`.
 */
export function deployWorkflow(version: string = RELEASE.version): string {
  return `# Written by sv setup. It calls the toolkit's own workflow at the version this repository pins; sv upgrade moves the pin.
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  deploy:
    uses: ${REUSABLE}@cli-v${version}
    secrets:
      SV_DEPLOY_KEY: \${{ secrets.SV_DEPLOY_KEY }}
`;
}

const PIN = new RegExp(
  `(${REUSABLE.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}@cli-v)(\\d+\\.\\d+\\.\\d+)`,
);

/** The version the workflow calls, or nothing when it does not call the toolkit's. */
export function pinnedWorkflowVersion(text: string): string | undefined {
  return PIN.exec(text)?.[2];
}

/** The same workflow, calling another release of the toolkit. */
export function repinWorkflow(text: string, version: string): string {
  return text.replace(PIN, `$1${version}`);
}

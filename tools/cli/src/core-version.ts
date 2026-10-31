import { gt, maxSatisfying } from 'semver';
import { Failed, Refused } from './errors.js';
import { RELEASE } from './release.js';
import type { Registry } from './registry.js';

/**
 * The core a new instance starts on: the newest release of core that is published and that this toolkit supports
 * (`RELEASE.core`), and never older than `RELEASE.newestCore`, the one this toolkit was made for. Only a plain `X.Y.Z` tag counts, so
 * `latest` and a pre-release are not chosen. If the registry cannot be asked, it is `newestCore`, and `say` is told why, so a setup
 * on a machine with no route to the registry still works.
 */
export async function newestPublishedCore(
  registry: Pick<Registry, 'tags'>,
  say: (message: string) => void,
): Promise<string> {
  try {
    const tags = (await registry.tags(RELEASE.images.core)).filter((tag) =>
      /^\d+\.\d+\.\d+$/.test(tag),
    );
    const newest = maxSatisfying(tags, RELEASE.core);
    return newest && gt(newest, RELEASE.newestCore) ? newest : RELEASE.newestCore;
  } catch (error) {
    if (!(error instanceof Refused) && !(error instanceof Failed)) throw error;
    say(
      `Could not look up the newest core (${error.message.replace(/\.$/, '')}), so it starts on ${RELEASE.newestCore}, the one this toolkit was made for. sv upgrade moves it on.`,
    );
    return RELEASE.newestCore;
  }
}

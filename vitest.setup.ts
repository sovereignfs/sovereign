// Run in every test process before any test: a `git` a test spawns works in the test's own folder, even under a git hook.
import { forgetRepository } from './scripts/lib/test-env';

forgetRepository(process.env);

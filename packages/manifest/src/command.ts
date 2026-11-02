import { dockerArgs, labelValue, MANIFEST_FILE, type DockerArgsFormat } from './label';
import { validate } from './validate';

/** What the command needs of its surroundings, so a test needs no file or terminal. */
export type Io = {
  /** The folder it runs in. */
  cwd: string;
  /** The text of a file, or `undefined` when there is none to read. */
  read(path: string): string | undefined;
  join(...parts: string[]): string;
  out(text: string): void;
  err(text: string): void;
};

const USAGE = `Usage: sovereign-manifest <command> [dir]

  check [dir]                       Check dir/${MANIFEST_FILE} (default: this folder) against its schema
  label [dir]                       Print the value of the image label made from it
  docker-args [dir] [--format F]    Print the arguments to build an image with: its label and PORT.
                                    F is shell (default; for eval) or github (for $GITHUB_OUTPUT)
`;

/** Runs the command and returns its exit code: 0 done, 1 the manifest is not valid or cannot be read, 2 a usage error. */
export function run(argv: readonly string[], io: Io): number {
  const [command, ...rest] = argv;
  if (command === undefined || command === '--help' || command === '-h') {
    (command === undefined ? io.err : io.out)(USAGE);
    return command === undefined ? 2 : 0;
  }
  if (command !== 'check' && command !== 'label' && command !== 'docker-args') {
    io.err(`Unknown command: ${command}\n\n${USAGE}`);
    return 2;
  }

  let format: DockerArgsFormat = 'shell';
  const dirs: string[] = [];
  for (let index = 0; index < rest.length; index += 1) {
    const word = rest[index] as string;
    if (word === '--format' && command === 'docker-args') {
      const value = rest[(index += 1)];
      if (value !== 'shell' && value !== 'github') {
        io.err(`--format is shell or github.\n\n${USAGE}`);
        return 2;
      }
      format = value;
    } else if (word.startsWith('-')) {
      io.err(`Unknown option: ${word}\n\n${USAGE}`);
      return 2;
    } else {
      dirs.push(word);
    }
  }
  if (dirs.length > 1) {
    io.err(`One folder at most.\n\n${USAGE}`);
    return 2;
  }

  const file = io.join(dirs[0] ?? io.cwd, MANIFEST_FILE);
  const text = io.read(file);
  if (text === undefined) {
    io.err(`${file} cannot be read. A manifest is that file at the root of the app’s source.\n`);
    return 1;
  }
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    io.err(`${file} is not JSON.\n`);
    return 1;
  }
  const result = validate(document);
  if (!result.ok) {
    io.err(
      `${file} is not a valid manifest:\n${result.problems.map((p) => `  ${p.at}: ${p.message}`).join('\n')}\n`,
    );
    return 1;
  }

  if (command === 'check') {
    io.out(`${file} is a valid manifest ${result.manifest.manifest}.\n`);
  } else if (command === 'label') {
    io.out(`${labelValue(result.manifest)}\n`);
  } else {
    io.out(`${dockerArgs(result.manifest, format)}\n`);
  }
  return 0;
}

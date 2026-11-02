# @sovereignfs/manifest

The manifest of an app on a [Sovereign](https://github.com/sovereignfs/sovereign) instance: what it provides so that the instance's
toolkit (`sv`) can host it ([`contracts/app-manifest.md`](https://github.com/sovereignfs/sovereign/blob/main/contracts/app-manifest.md)).

An app's manifest is the file `sovereign.manifest.json` at the root of its source. The image built from it carries the same manifest as a
label, so the instance can read it from the registry without pulling the image. This package makes the label from the file, and the
toolkit validates with the same code, so the two cannot disagree about what a valid manifest is.

## The command

```bash
npm install --save-dev @sovereignfs/manifest

npx sovereign-manifest check               # is ./sovereign.manifest.json a valid manifest?
npx sovereign-manifest label               # the value of the image label
npx sovereign-manifest docker-args         # --label '…' --build-arg 'PORT=…', for a shell
```

`docker-args` is for a build you run yourself, with `eval`, and `--format github` is for a workflow, where its two lines go to
`$GITHUB_OUTPUT` and `docker/build-push-action` reads them as `labels` and `build-args`:

```bash
eval "docker build $(npx sovereign-manifest docker-args) -t ghcr.io/you/notes:1.0.0 ."
```

```yaml
- id: manifest
  run: npx sovereign-manifest docker-args --format github >> "$GITHUB_OUTPUT"
- uses: docker/build-push-action@v7
  with:
    labels: ${{ steps.manifest.outputs.labels }}
    build-args: ${{ steps.manifest.outputs.build-args }}
```

The port reaches the image as the build argument `PORT`, so a Dockerfile writes it nowhere:

```dockerfile
ARG PORT
ENV PORT=${PORT}
EXPOSE ${PORT}
```

An app in a repository with several, or built from the repository's root, gives the command the folder: `sovereign-manifest label clients/web`.
Exit codes: `0` done, `1` the manifest cannot be read or is not valid (each problem is listed on stderr, and nothing on stdout), `2` a usage error.

## The library

```ts
import { normalise, validate } from '@sovereignfs/manifest';

const result = validate(JSON.parse(text)); // { ok: true, manifest } or { ok: false, problems: [{ at, message }] }
if (result.ok) normalise(result.manifest); // what any version means: prefix, variablePrefix, launch, secrets with sizes, …
```

`schemas` holds the JSON Schema of every manifest version the package reads, and `supportedVersions` says which. Today that is manifest 1.

## Licence

MPL-2.0.

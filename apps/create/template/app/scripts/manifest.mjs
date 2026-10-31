// The manifest label in the Dockerfile is what an instance reads to host this app, so it must say what sovereign.manifest.json says.
//   node scripts/manifest.mjs          checks that it does
//   node scripts/manifest.mjs --write  copies the manifest into the label
import { readFileSync, writeFileSync } from 'node:fs';

const PREFIX = 'LABEL io.github.sovereignfs.app-manifest=';
const manifest = JSON.parse(readFileSync('sovereign.manifest.json', 'utf8'));
// A Dockerfile quotes a value as JSON quotes a string, so the label is the manifest as a JSON string of JSON.
const wanted = `${PREFIX}${JSON.stringify(JSON.stringify(manifest))}`;
const lines = readFileSync('Dockerfile', 'utf8').split('\n');
const at = lines.findIndex((line) => line.startsWith(PREFIX));

if (process.argv.includes('--write')) {
  if (at === -1) lines.push(wanted);
  else lines[at] = wanted;
  writeFileSync('Dockerfile', lines.join('\n'));
  console.log('Wrote the manifest label.');
} else if (lines[at] !== wanted) {
  console.error(
    'The manifest label in the Dockerfile differs from sovereign.manifest.json. Run: npm run manifest:write',
  );
  process.exit(1);
} else {
  console.log('The manifest label matches.');
}

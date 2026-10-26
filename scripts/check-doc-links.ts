import { checkDocLinks } from './lib/doc-links';

const findings = checkDocLinks(process.cwd());

if (findings.length === 0) {
  console.log('docs:check-links - every relative link resolves.');
} else {
  console.error(`docs:check-links - ${findings.length} broken link(s):\n`);
  for (const finding of findings) {
    console.error(`  ${finding.file}:${finding.line}  ${finding.target}  (${finding.reason})`);
  }
  process.exitCode = 1;
}

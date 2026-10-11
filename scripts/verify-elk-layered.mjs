import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const provenance = JSON.parse(readFileSync(resolve(root, 'vendor/elk-layered/provenance.json'), 'utf8'));
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
for (const path of [require.resolve('elk-layered'), resolve(root, 'vendor/elk-layered/elk-worker.cjs')]) {
  if (hash(path) !== provenance.artifactSha256) throw new Error(`ELK artifact checksum mismatch: ${path}`);
}
for (const [path, expected] of Object.entries(provenance.recipeSha256)) {
  // Git normalizes line endings on Windows; provenance tracks canonical LF source.
  const contents = readFileSync(resolve(root, path), 'utf8').replaceAll('\r\n', '\n');
  if (createHash('sha256').update(contents).digest('hex') !== expected)
    throw new Error(`Rebuild ELK after changing ${path}`);
}
if (require('elkjs/package.json').version !== provenance.version)
  throw new Error('ELK API and compiler versions differ');
console.log(`ELK ${provenance.version} pinned sources, build recipe and artifact checksums verified.`);

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import manifest from '../package.json' with { type: 'json' };

const output = new URL('../dist/', import.meta.url);
const releaseManifest = { ...manifest, releaseCommit: process.env.GITHUB_SHA ?? null };

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all([
  cp(new URL('../src/', import.meta.url), new URL('src/', output), {
    recursive: true,
    filter: file => !file.endsWith('.test.mjs'),
  }),
  writeFile(new URL('package.json', output), JSON.stringify(releaseManifest, null, 2) + '\n'),
  cp(new URL('../package-lock.json', import.meta.url), new URL('package-lock.json', output)),
]);

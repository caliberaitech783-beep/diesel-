import { cp, mkdir } from 'node:fs/promises';

const output = new URL('../dist/', import.meta.url);
await mkdir(output, { recursive: true });
await Promise.all([
  cp(new URL('../src/', import.meta.url), new URL('src/', output), {
    recursive: true,
    filter: file => !file.endsWith('.test.mjs'),
  }),
  cp(new URL('../package.json', import.meta.url), new URL('package.json', output)),
  cp(new URL('../package-lock.json', import.meta.url), new URL('package-lock.json', output)),
]);

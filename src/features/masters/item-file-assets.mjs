import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const files = {
  'xlsx.mjs': resolve(dirname(require.resolve('xlsx')), 'xlsx.mjs'),
  'csv-parse.mjs': resolve(dirname(require.resolve('csv-parse/sync')), '../esm/sync.js'),
  'csv-stringify.mjs': resolve(dirname(require.resolve('csv-stringify/sync')), '../esm/sync.js'),
  'pdf-lib.mjs': resolve(dirname(require.resolve('pdf-lib/package.json')), 'dist/pdf-lib.esm.min.js'),
  'fontkit.mjs': resolve(dirname(require.resolve('@pdf-lib/fontkit/package.json')), 'dist/fontkit.umd.min.js'),
  'regenerator-runtime.mjs': require.resolve('regenerator-runtime/runtime.js'),
  'item-font.ttf': resolve(dirname(require.resolve('@expo-google-fonts/noto-sans-devanagari/package.json')), '400Regular/NotoSansDevanagari_400Regular.ttf'),
};

export function registerItemFileAssets(app) {
  for (const [name, file] of Object.entries(files)) {
    app.get('/masters/item-files/' + name, (_request, response) => {
      response.type(name.endsWith('.ttf') ? 'font/ttf' : 'text/javascript')
        .sendFile(basename(file), { root: dirname(file) });
    });
  }
}

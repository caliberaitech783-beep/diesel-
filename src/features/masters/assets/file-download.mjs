export const fileAssets = '/masters/item-files/';

export async function loadPdfAssets() {
  const [pdf, , font] = await Promise.all([
    import(fileAssets + 'pdf-lib.mjs'),
    import(fileAssets + 'regenerator-runtime.mjs').then(() => import(fileAssets + 'fontkit.mjs')),
    fetch(fileAssets + 'item-font.ttf'),
  ]);
  if (!font.ok) throw new Error('The PDF font could not be loaded.');
  return [pdf, globalThis.fontkit, await font.arrayBuffer()];
}

export function downloadFile(contents, type, name) {
  const href = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

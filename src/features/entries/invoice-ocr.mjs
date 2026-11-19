import { createWorker } from 'tesseract.js';
import english from '@tesseract.js-data/eng';
import { validDate } from './entry-rules.mjs';

export function invoiceFields(text) {
  const invoice = /\binvoice\s*(?:no\.?|number|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9/\-]{2,39})\b/i.exec(text)?.[1];
  const rawDate = /\binvoice\s+date\s*[:#-]?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})\b/i.exec(text)?.[1];
  const parts = rawDate?.split(/[-/]/);
  if (parts?.[2].length === 4) parts.reverse();
  const date = parts?.map(part => part.padStart(2, '0')).join('-');
  const eway = /\be[\s-]?way\s+bill(?:\s+(?:no\.?|number))?\s*[:#-]?\s*(\d{12})\b/i.exec(text)?.[1];
  const litres = /\b(?:invoice\s+)?(?:quantity|qty)\s*[:#-]?\s*([\d,]+(?:\.\d+)?)\s*(?:L|litres?)\b/i.exec(text)?.[1]?.replaceAll(',', '');
  const truck = /\b(?:vehicle|truck)\s+(?:no\.?|number|registration)\s*[:#-]?\s*([A-Z]{2}\s*\d{2}\s*[A-Z]{1,3}\s*\d{3,4})\b/i.exec(text)?.[1]?.replace(/\s+/g, '');
  return Object.fromEntries(Object.entries({ invoice, invoiceDate: validDate(date) ? date : undefined, eway, litres, truck })
    .filter(([, value]) => value !== undefined));
}

export function isInvoiceImage(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || bytes.toString('ascii', 12, 16) !== 'IHDR') return false;
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 && width <= 1600 && height <= 1600;
}

export async function readInvoiceImage(bytes) {
  const worker = await createWorker(english.code, 1, { langPath: english.langPath, gzip: english.gzip, cacheMethod: 'none' });
  try {
    const { data } = await worker.recognize(bytes);
    return invoiceFields(data.text);
  } finally {
    await worker.terminate();
  }
}

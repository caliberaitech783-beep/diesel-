import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// The built-in PDF fonts cover Latin text only; anything else is shown as "?" so the file always opens.
const latin = value => String(value ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/[^\x20-\x7e\xa0-\xff\n]/g, '?');

function wrap(text, font, size, width) {
  const lines = [];
  for (const paragraph of latin(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (line && font.widthOfTextAtSize(next, size) > width) { lines.push(line); line = word; }
      else line = next;
    }
    lines.push(line);
  }
  return lines;
}

// One A4 page: the indent as label and value rows. `rows` is [[label, value], …].
export async function indentPdf({ title, number, rows, footer }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(latin(title + ' ' + number));
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const left = 50, valueLeft = 200, right = 545, ink = rgb(0.1, 0.12, 0.16), muted = rgb(0.38, 0.42, 0.48);
  let y = 790;
  page.drawText('Caliber Mining and Logistics Ltd', { x: left, y, size: 11, font: regular, color: muted });
  y -= 26;
  page.drawText(latin(title), { x: left, y, size: 20, font: bold, color: ink });
  y -= 22;
  page.drawText(latin(number), { x: left, y, size: 13, font: regular, color: ink });
  y -= 16;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: muted });
  y -= 24;
  for (const [label, value] of rows) {
    const lines = wrap(value || '-', regular, 11, right - valueLeft);
    if (y - lines.length * 15 < 80) break;
    page.drawText(latin(label), { x: left, y, size: 10, font: bold, color: muted });
    for (const line of lines) { page.drawText(line, { x: valueLeft, y, size: 11, font: regular, color: ink }); y -= 15; }
    y -= 9;
  }
  page.drawText(latin(footer), { x: left, y: 50, size: 9, font: regular, color: muted });
  return pdf.save();
}

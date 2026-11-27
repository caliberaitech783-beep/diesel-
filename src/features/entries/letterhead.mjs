// The company letterhead that tops every printed record, every PDF and every Excel download.
import { readFileSync } from 'node:fs';

export const company = {
  name: 'CALIBER MINING AND LOGISTICS LIMITED',
  address: ['Address : OFFICE NO.1101, NANIKS ASHTAVINAYAK PARK AVENUE, NEAR NAGPUR URBAN', 'NAGPUR M Corp,'],
  contact: 'Phone No.: 07722233455   Email : mohit@chaddagroup.com'
};
const logoUrl = new URL('./assets/caliber-logo.png', import.meta.url);

// For a printed page: hidden on screen, shown by the print rules.
export const letterheadHtml = () => `<div class="print-only letterhead"><img src="/entries/assets/caliber-logo.png" alt="Caliber" width="118" height="54">
    <div><strong>${company.name}</strong>${company.address.map(line => `<span>${line}</span>`).join('')}<span>${company.contact}</span></div></div>`;

// For a spreadsheet: the same lines as the top rows, then a blank row.
export const letterheadRows = () => [[company.name], [company.address.join(' ')], [company.contact], []];

// For a PDF page: draws the letterhead with its top at `top` and returns the y to carry on from.
export async function letterheadPainter(pdf, { regular, bold, ink, line, left = 40, right = 555 }) {
  const logo = await pdf.embedPng(readFileSync(logoUrl));
  const logoWidth = 84, logoHeight = logoWidth * logo.height / logo.width;
  return (page, top) => {
    page.drawImage(logo, { x: left, y: top - logoHeight, width: logoWidth, height: logoHeight });
    const from = left + logoWidth, middle = from + (right - from) / 2;
    const centred = (value, y, size, font) => page.drawText(value, { x: middle - font.widthOfTextAtSize(value, size) / 2, y, size, font, color: ink });
    let y = top - 13;
    centred(company.name, y, 13.5, bold); y -= 12;
    for (const text of [...company.address, company.contact]) { centred(text, y, 8, regular); y -= 10; }
    y = Math.min(y, top - logoHeight) - 2;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: line });
    return y - 18;
  };
}

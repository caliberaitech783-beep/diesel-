const recordColumns = [
  ['Master', 'master'], ['Record code', 'code'], ['Record name', 'name'],
  ['Record status', 'status'], ['Site', 'site'], ['Revision', 'revision'], ['Last saved (UTC)', 'updatedAt'],
];

function metadata(showSite) {
  return showSite ? recordColumns : recordColumns.filter(([, key]) => key !== 'site');
}

export function exportTable(records, showSite) {
  const summary = metadata(showSite);
  const fields = [...new Set(records.flatMap(record => record.fields.map(([name]) => name)))];
  const labels = summary.map(([label]) => label);
  const columns = [...labels, ...fields.map(name => labels.includes(name) ? 'Saved ' + name : name)];
  const rows = records.map(record => {
    const values = new Map(record.fields);
    return [...summary.map(([, key]) => record[key]), ...fields.map(name => values.get(name) ?? '')];
  });
  return { columns, rows };
}

export function fitExcelCells(table) {
  const { columns, rows } = table;
  const maximum = 32767;
  if (!rows.some(row => row.some(value => typeof value === 'string' && value.length > maximum))) return table;
  const split = rows.map(row => row.map(value => {
    if (typeof value !== 'string' || value.length <= maximum) return [value];
    const parts = [];
    for (let start = 0; start < value.length;) {
      let end = Math.min(value.length, start + maximum);
      if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1])) end--;
      parts.push(value.slice(start, end));
      start = end;
    }
    return parts;
  }));
  const widths = columns.map((_, index) => split.reduce((width, row) => Math.max(width, row[index].length), 1));
  return {
    columns: columns.flatMap((label, index) => Array.from({ length: widths[index] }, (_, part) =>
      part ? label + ' (continued ' + (part + 1) + ')' : label)),
    rows: split.map(row => row.flatMap((parts, index) => Array.from({ length: widths[index] }, (_, part) => parts[part] ?? ''))),
  };
}

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

function wrapText(value, width, font, size) {
  const lines = [];
  const measure = text => font.widthOfTextAtSize(text, size);
  const spaceWidth = measure(' ');
  const wordWidths = new Map();
  const text = String(value ?? '').replace(/\r\n?/g, '\n').replace(/[\t\f]+/g, ' ');
  for (const paragraph of text.split('\n')) {
    let line = '';
    let lineWidth = 0;
    for (const word of paragraph.match(/\S+/gu) ?? []) {
      if (!wordWidths.has(word)) wordWidths.set(word, measure(word));
      const wordWidth = wordWidths.get(word);
      const gap = line ? spaceWidth : 0;
      if (lineWidth + gap + wordWidth <= width) {
        line += (line ? ' ' : '') + word;
        lineWidth += gap + wordWidth;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      lineWidth = 0;
      if (wordWidth <= width) {
        line = word;
        lineWidth = wordWidth;
        continue;
      }
      for (const { segment } of segmenter.segment(word)) {
        if (line && measure(line + segment) > width) {
          lines.push(line);
          line = '';
        }
        line += segment;
      }
      lineWidth = measure(line);
    }
    lines.push(line);
  }
  return lines;
}

export async function writeMasterDataPdf(records, showSite, { PDFDocument, rgb }, fontkit, fontBytes) {
  const document = await PDFDocument.create();
  document.setTitle('Diesel Master Data');
  document.registerFontkit(fontkit);
  const font = await document.embedFont(fontBytes);
  const width = 595.28;
  const height = 841.89;
  const margin = 42;
  const tableWidth = width - margin * 2;
  const fieldWidth = 150;
  const valueX = margin + fieldWidth + 12;
  const textSize = 10;
  let page;
  let y;

  function drawText(text, x, size = textSize) {
    if (text) page.drawText(text, { x, y, size, font });
  }

  function addPage() {
    page = document.addPage([width, height]);
    y = height - margin;
    drawText('Diesel Master Data', margin, 20);
    y = margin - 17;
    drawText(String(document.getPageCount()), width - margin);
    y = height - margin - 38;
  }

  function startRecord(record) {
    for (const line of wrapText(record.master + ' · ' + record.code, tableWidth, font, 14)) {
      drawText(line, margin, 14);
      y -= 17;
    }
    page.drawRectangle({ x: margin, y: y - 6, width: tableWidth, height: 19, color: rgb(.94, .91, .97) });
    drawText('Field', margin + 5);
    drawText('Value', valueX);
    y -= 22;
  }

  addPage();
  if (!records.length) drawText('No saved records in this view.', margin);
  for (const record of records) {
    if (y < 180) addPage();
    startRecord(record);
    const entries = [...metadata(showSite).map(([label, key]) => [label, record[key]]), ...record.fields];
    for (const [label, value] of entries) {
      if (value === '') continue;
      const labels = wrapText(label, fieldWidth, font, textSize);
      const values = wrapText(value, tableWidth - fieldWidth - 14, font, textSize);
      for (let line = 0; line < Math.max(labels.length, values.length); line++) {
        if (y < margin) {
          addPage();
          startRecord(record);
        }
        drawText(labels[line], margin + 5);
        drawText(values[line], valueX);
        y -= 13;
      }
      page.drawLine({
        start: { x: margin, y: y + 4 }, end: { x: width - margin, y: y + 4 },
        thickness: .45, color: rgb(.84, .84, .88),
      });
      y -= 4;
    }
    y -= 18;
  }
  return document.save();
}

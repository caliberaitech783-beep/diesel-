// What is approved through the approver lists: diesel indents and purchase orders. Each kind has its own
// approvers, Telegram bot, pages and wording; the way a request is sent, decided and closed is shared.
import { purchaseOrderPdf, purchaseOrderSheet } from '../entries/purchase-order-pdf.mjs';

export const indentKind = {
  key: 'indent', tables: 'indent', callback: 'indent', quantity: true,
  noun: 'indent', title: 'Indent', plural: 'indents', label: 'Diesel indent', saveAction: 'Save indent', register: ['/entries/type/E1', 'Diesel indents'],
  tokenName: 'DIESEL_INDENT_BOT_TOKEN', webhookPath: '/telegram/indent-approval', approversPath: '/indent-approvers', approvalsPath: '/indent-approvals',
};

export const orderKind = {
  key: 'order', tables: 'po', callback: 'po', quantity: false,
  noun: 'purchase order', title: 'Purchase order', plural: 'purchase orders', label: 'Purchase order', saveAction: 'Save PO', register: ['/entries/type/E2', 'Purchase orders'],
  tokenName: 'DIESEL_PO_BOT_TOKEN', webhookPath: '/telegram/po-approval', approversPath: '/po-approvers', approvalsPath: '/po-approvals',
  // The caption under the PDF and on the approval page: enough to decide without opening the file.
  summary(doc, sources) {
    const sheet = purchaseOrderSheet(doc, sources), cell = Object.fromEntries(sheet.sections.flatMap(([, rows]) => rows));
    const litres = Number(doc.data?.litres ?? (doc.data?.kl ? doc.data.kl * 1000 : NaN));
    const caption = ['Purchase order ' + sheet.number, 'Location: ' + (cell.Location || '-') + ' · Site: ' + cell.Site, 'Vendor: ' + (cell['Party / Vendor Name'] ?? ''),
      Number.isFinite(litres) && 'Quantity: ' + litres.toLocaleString('en-IN') + ' litres', 'P.O. Amount: Rs. ' + sheet.totals[2][1],
      doc.createdBy && 'Created by: ' + doc.createdBy].filter(Boolean).join('\n').slice(0, 700);
    return { number: sheet.number, caption, litres: Number.isFinite(litres) && litres > 0 ? litres : null };
  },
  pdf: (doc, sources) => purchaseOrderPdf(doc, sources),
};

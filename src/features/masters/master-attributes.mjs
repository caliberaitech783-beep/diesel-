export const attributeColumn = 'Dated attributes';
export const attributeMasters = new Set(['cmll-master','account-master','location-master']);
export const attributeNames = ['GSTIN','VAT registration','PAN','TAN','Explosive licence','MSME (Udyam)','State','Latitude','Longitude','Licence or certificate'];
export const maxAttributes = 30;

export function attributeExport(rows) {
  return rows?.length ? JSON.stringify(rows.map(({ name,reference,validFrom,validTo,value,attachment })=>
    ({ name,reference,value,validFrom,validTo,...(attachment?.name ? {attachmentName:attachment.name} : {}) }))) : '';
}

export function attributeExpiry(validTo, now = Date.now()) {
  if (!validTo) return '';
  const today=new Date(now+19_800_000).toISOString().slice(0,10);
  const days=(Date.parse(validTo)-Date.parse(today))/86400000;
  return days<0 ? 'Expired' : days<=30 ? 'Expires within 30 days' : '';
}

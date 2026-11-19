import { randomUUID } from 'node:crypto';
import { MasterRecordError, validateScalar } from './records-fields.mjs';
import { attributeMasters, attributeNames, maxAttributes } from './master-attributes.mjs';

const field = (label, type) => ({label,type});
const text = (label, value) => validateScalar(field(label,'text'),value??'');
const date = (label, value) => validateScalar(field(label,'date'),value??'');

export function cleanAttributes(slug,input,current,saveAttachment) {
  if (input===undefined) return current ?? [];
  if (!attributeMasters.has(slug) || !Array.isArray(input) || input.length>maxAttributes) {
    throw new MasterRecordError('Choose up to '+maxAttributes+' dated attributes for a supported master.');
  }
  const known=new Set((current??[]).map(row=>row.id)), used=new Set();
  return input.map(raw=>{
    if (!raw || typeof raw!=='object' || Array.isArray(raw)) throw new MasterRecordError('Enter a valid attribute row.');
    const { name } = raw;
    if (!attributeNames.includes(name)) throw new MasterRecordError('Choose an approved attribute name.');
    const value=text('Attribute value',raw.value);
    if (!value) throw new MasterRecordError('Enter a value for '+name+'.');
    const reference=text('Jurisdiction or reference',raw.reference);
    if (value.length>256 || reference.length>100) throw new MasterRecordError('Use up to 256 characters for the value and 100 for its reference.');
    const validFrom=date('Valid from date',raw.validFrom), validTo=date('Valid to date',raw.validTo);
    if (validFrom && validTo && validFrom>validTo) throw new MasterRecordError('Valid to must be on or after valid from.');
    if (raw.id && (!known.has(raw.id) || used.has(raw.id))) throw new MasterRecordError('Choose an attribute belonging to this record.');
    const id=raw.id||randomUUID();
    used.add(id);
    const attachment=raw.attachment ? saveAttachment('dated-attribute:'+id,raw.attachment) : undefined;
    return { id,name,reference,value,validFrom,validTo,attachment };
  });
}

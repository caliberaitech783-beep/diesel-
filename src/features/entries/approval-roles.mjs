import { entryRole } from './review-masters.mjs';

export function mayApproveEntry(doc, actor) {
  return doc.status === 'Awaiting approval' && doc.site === actor.site && doc.maker !== actor.id
    && doc.result.approvals?.[doc.stage] === entryRole(actor);
}

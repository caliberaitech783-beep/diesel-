import { requireValue } from './entry-rules.mjs';

const normalized = value => String(value ?? '').trim().normalize('NFKC').toLowerCase();

// Driver Master: the Login ID ties an operator to the bowsers and points listed for them.
export function operatorAccess(values) {
  return { login:normalized(values['Login ID']),
    authorised:String(values['Bowsers or points authorised'] ?? '').split(/[,;\n]/).map(normalized).filter(Boolean) };
}

// An operator with a list may use only those bowsers. An operator with no list keeps the site's bowsers.
export function checkOperator(context, storage) {
  const login = normalized(context.doc.maker);
  const operator = context.siteConfig?.drivers?.find(driver=>driver.login && driver.login===login);
  requireValue(!operator?.authorised?.length || operator.authorised.includes(normalized(storage)),
    'Driver Master does not authorise you for '+storage+'. Ask the Site In-charge to update your bowsers.');
}

// Parties from the Account Master, offered as the vendor on a purchase order with their address and contact.
import accounts from '../company-records/account-master-data.mjs';

const join = (...parts) => parts.map(part => String(part ?? '').trim().replace(/[,\s]+$/, '')).filter(Boolean).join(', ');
export const accountVendors = [...new Map(accounts.filter(account => account.Status !== 'Inactive' && account['A/C Name'])
  .map(account => [account['A/C Name'], {
    name: account['A/C Name'], code: account['A/C Code'],
    address: join(account['Office Address 1'] ?? account['Work Address 1'], account['Office City'] ?? account['Work City'],
      account['Office State'] ?? account['Work State'], account['Office Pin Code'] ?? account['Work Pin Code']),
    contact: String(account['Contact No.'] ?? account['Work Mobile No'] ?? '').trim(),
  }])).values()].sort((first, second) => first.name.localeCompare(second.name));
export const accountVendor = name => accountVendors.find(vendor => vendor.name === name);

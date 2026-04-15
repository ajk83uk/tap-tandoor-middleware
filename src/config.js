// ─── Tap & Tandoor — Site Configuration ───────────────────────────────────────
// Production CompanyCode: 574 (all Tap & Tandoor sites)
// Demo/sandbox CompanyCode: 48  (set via FT_COMPANY_CODE env var)
// SiteCodes sourced from FavouriteTable account — confirmed April 2026
// Note: SiteCode 2102 (Darts & Shuffleboard) is EXCLUDED — prepaid bookings only

const COMPANY_CODE      = parseInt(process.env.FT_COMPANY_CODE)      || 574;
const SALE_CHANNEL_CODE = parseInt(process.env.FT_SALE_CHANNEL_CODE) || 103;

// Maps each site's inbound phone number to its FavouriteTable SiteCode.
// Replace the phone number placeholders once Twilio numbers are purchased.
const SITE_ROUTING = {
  // Format: E.164 UK numbers e.g. +441212XXXXXX
  // Update these once you have your Twilio numbers
  '+441214000000': { siteCode: 2084, name: 'Solihull',      address: '678 Warwick Road, Solihull B91 3DX' },
  '+441733000000': { siteCode: 2083, name: 'Peterborough',  address: '53 Cumbergate, Queensgate Shopping Centre, Peterborough PE1 1YR' },
  '+442392000000': { siteCode: 2086, name: 'Portsmouth',    address: 'Gunwharf Quays, Portsmouth PO13TZ' },
  '+441202000000': { siteCode: 2082, name: 'Bournemouth',   address: '7a-11 Richmond Hill, Bournemouth BH2 6HE' },
  '+442380000000': { siteCode: 2085, name: 'Southampton',   address: 'W Quay Rd, Southampton SO15 1DE' },
};

// All valid site codes — used for validation
const VALID_SITE_CODES = [2082, 2083, 2084, 2085, 2086];

/**
 * Resolve a site from an inbound Twilio phone number.
 * Returns { siteCode, name, address, companyCode } or null if not found.
 */
function getSiteByPhoneNumber(toNumber) {
  const site = SITE_ROUTING[toNumber];
  if (!site) return null;
  return { ...site, companyCode: COMPANY_CODE };
}

/**
 * Resolve a site directly from a siteCode (useful for testing).
 */
function getSiteBySiteCode(siteCode) {
  const entry = Object.values(SITE_ROUTING).find(s => s.siteCode === siteCode);
  if (!entry) return null;
  return { ...entry, companyCode: COMPANY_CODE };
}

module.exports = { COMPANY_CODE, SALE_CHANNEL_CODE, SITE_ROUTING, VALID_SITE_CODES, getSiteByPhoneNumber, getSiteBySiteCode };

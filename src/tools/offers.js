// ─── Tool: get_offers ─────────────────────────────────────────────────────────
// Returns available booking offers for a site — used to get the Live Sports
// offer code which must be passed through availability and booking calls.

const { ftRequest } = require('../ft-client');
const { COMPANY_CODE } = require('../config');

const cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getOffers(req, res) {
  const { siteCode } = req.body;
  if (!siteCode) return res.status(400).json({ success: false, error: 'siteCode required' });

  try {
    const cacheKey = `offers_${siteCode}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    const result = await ftRequest('/Booking/GetOfferList', 'POST', {
      SiteCode: siteCode,
      CompanyCode: COMPANY_CODE,
    });

    const offers = (result.ResultInfo || result.OfferList || []).map(o => ({
      offerCode: o.OfferCode,
      offerName: o.OfferName,
      description: o.Description || '',
    }));

    const response = {
      success: true,
      offers,
      // The LLM uses this to identify which offer code to use for live sports
      message: offers.length > 0
        ? `Available booking types: ${offers.map(o => `${o.offerName} (code: ${o.offerCode})`).join(', ')}.`
        : 'No special booking types available — use standard dining.',
    };

    cache.set(cacheKey, { data: response, ts: Date.now() });
    return res.json(response);

  } catch (err) {
    console.error('[get_offers]', err.message);
    // On error, default to standard dining — don't block the booking flow
    return res.json({
      success: true,
      offers: [],
      message: 'Standard dining only — could not retrieve special booking types.',
    });
  }
}

module.exports = { getOffers };

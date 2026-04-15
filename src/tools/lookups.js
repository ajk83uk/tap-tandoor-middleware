// ─── Tools: get_occasions, get_allergens, check_guest_blocked ─────────────────
// These are called once at the start of a booking session and cached in memory
// to avoid repeated API calls during a single conversation.

const { getOccasionList, getAllergenList, isGuestBlocked } = require('../ft-client');
const { COMPANY_CODE } = require('../config');

// Simple in-memory cache — TTL of 1 hour (occasions and allergens rarely change)
const cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// ─── Get Occasions ────────────────────────────────────────────────────────────
async function getOccasions(req, res) {
  try {
    const cacheKey = `occasions_${COMPANY_CODE}`;
    let occasions = getFromCache(cacheKey);

    if (!occasions) {
      const result = await getOccasionList(COMPANY_CODE);
      occasions = (result.ResultInfo || result.OccasionList || []).map(o => ({
        code: o.OccasionTypeCode,
        name: o.OccasionTypeName,
      }));
      setCache(cacheKey, occasions);
    }

    return res.json({
      success: true,
      occasions,
      // Voice-friendly list for the LLM to read out
      message: occasions.length > 0
        ? `Special occasions we can note: ${occasions.map(o => o.name).join(', ')}.`
        : 'No special occasion options available.',
    });

  } catch (err) {
    console.error('[get_occasions]', err.message);
    return res.status(500).json({ success: false, occasions: [], message: 'Could not retrieve occasion types.' });
  }
}

// ─── Get Allergens ────────────────────────────────────────────────────────────
async function getAllergens(req, res) {
  const { siteCode } = req.body;
  if (!siteCode) return res.status(400).json({ success: false, error: 'siteCode required' });

  try {
    const cacheKey = `allergens_${siteCode}`;
    let allergens = getFromCache(cacheKey);

    if (!allergens) {
      const result = await getAllergenList(siteCode);
      allergens = (result.ResultInfo || result.AllergenList || []).map(a => ({
        code: a.AllergenCode,
        name: a.AllergenName,
      }));
      setCache(cacheKey, allergens);
    }

    return res.json({
      success: true,
      allergens,
      message: allergens.length > 0
        ? `Dietary requirements we can note: ${allergens.map(a => a.name).join(', ')}.`
        : 'No allergen options available.',
    });

  } catch (err) {
    console.error('[get_allergens]', err.message);
    return res.status(500).json({ success: false, allergens: [], message: 'Could not retrieve allergen options.' });
  }
}

// ─── Check Guest Blocked ──────────────────────────────────────────────────────
async function checkGuestBlocked(req, res) {
  const { email, phone } = req.body;

  if (!email && !phone) {
    return res.status(400).json({ success: false, error: 'Provide email or phone to check.' });
  }

  try {
    const result = await isGuestBlocked({ companyCode: COMPANY_CODE, email, phone });
    const isBlocked = result?.IsBlocked === true;

    return res.json({
      success: true,
      isBlocked,
      message: isBlocked
        ? 'BLOCKED' // LLM should escalate to staff — do not read this aloud directly
        : 'clear',
    });

  } catch (err) {
    console.error('[check_guest_blocked]', err.message);
    // On error, default to allowing the booking — don't block a guest on an API error
    return res.json({ success: true, isBlocked: false, message: 'clear' });
  }
}

module.exports = { getOccasions, getAllergens, checkGuestBlocked };

require('dotenv').config();
const express = require('express');
const { vapiAuth } = require('./middleware/auth');
const { getSiteByPhoneNumber } = require('./config');
const { checkAvailability } = require('./tools/availability');
const { createBooking, lookupBooking, cancelBookingHandler } = require('./tools/booking');
const { joinWaitlist } = require('./tools/waitlist');
const { getOccasions, getAllergens, checkGuestBlocked } = require('./tools/lookups');
const { getOffers } = require('./tools/offers');

const app = express();
app.use(express.json());

// ─── Vapi Response Wrapper ────────────────────────────────────────────────────
// Vapi passes the "result" field from the tool response back to the LLM.
// Keep it as a clean plain-text string — no nested JSON, no extra fields.
app.use('/tools', (req, res, next) => {
  // Log every incoming tool request so we can see what Vapi sends
  console.log(`[tool-request] ${req.method} ${req.path}`);
  console.log(`[tool-request] headers: x-vapi-secret=${req.headers['x-vapi-secret'] ? 'present' : 'MISSING'} content-type=${req.headers['content-type']}`);
  console.log(`[tool-request] body: ${JSON.stringify(req.body)}`);

  const originalJson = res.json.bind(res);
  res.json = (data) => {
    const resultText = data?.message || (data?.error ? `Error: ${data.error}` : 'No data returned.');
    console.log(`[tool-response] ${req.path} → ${resultText.slice(0, 120)}`);
    // Always return HTTP 200 so Vapi reads the result field
    res.status(200);
    return originalJson({ result: resultText });
  };
  next();
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'tap-tandoor-voice-middleware' }));

// ─── Site Resolution ──────────────────────────────────────────────────────────
// Called at the start of every Vapi call to identify which site is being called.
// Vapi passes the inbound "to" number in the webhook payload.
app.post('/site', vapiAuth, (req, res) => {
  const toNumber = req.body?.call?.phoneNumber?.number || req.body?.toNumber;

  if (!toNumber) {
    return res.status(400).json({ error: 'toNumber is required' });
  }

  const site = getSiteByPhoneNumber(toNumber);
  if (!site) {
    console.warn(`[site] Unknown inbound number: ${toNumber}`);
    return res.status(404).json({ error: 'Site not found for this number' });
  }

  console.log(`[site] Call for ${site.name} (siteCode: ${site.siteCode})`);
  return res.json(site);
});

// ─── Tool Routes (called by Vapi LLM during conversation) ────────────────────
// All tool routes require Vapi auth and expect siteCode in the request body.

// Availability — chain of GetDateList → GetShiftList → GetTimeslotList
app.post('/tools/check_availability', vapiAuth, checkAvailability);

// Lookups — occasions, allergens (cached), guest block check
app.post('/tools/get_occasions',       vapiAuth, getOccasions);
app.post('/tools/get_allergens',       vapiAuth, getAllergens);
app.post('/tools/check_guest_blocked', vapiAuth, checkGuestBlocked);

// Booking lifecycle
app.post('/tools/create_booking', vapiAuth, createBooking);
app.post('/tools/lookup_booking', vapiAuth, lookupBooking);
app.post('/tools/cancel_booking', vapiAuth, cancelBookingHandler);

// Waitlist
app.post('/tools/join_waitlist', vapiAuth, joinWaitlist);

// Offers (standard dining vs live sports)
app.post('/tools/get_offers', vapiAuth, getOffers);

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[unhandled]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅  Tap & Tandoor voice middleware running on port ${PORT}`);
  console.log(`    FT Base URL: ${process.env.FT_BASE_URL || 'NOT SET'}`);
  console.log(`    Auth token:  ${process.env.FT_AUTH_TOKEN ? '✓ set' : '✗ NOT SET'}`);
  console.log(`    API key:     ${process.env.FT_API_KEY ? '✓ set' : '✗ NOT SET'}`);
});

module.exports = app;

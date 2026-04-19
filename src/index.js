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

// ─── Vapi Tool Request Normaliser ─────────────────────────────────────────────
// Vapi sends tool calls in a nested envelope format:
//   { message: { type: "tool-calls", toolCallList: [{ id, name, arguments: {...} }] } }
// We extract the arguments into req.body (flat) and store the toolCallId so the
// response wrapper can return the correct format Vapi expects.
app.use('/tools', (req, res, next) => {
  const msg = req.body?.message;

  if (msg?.type === 'tool-calls') {
    // Vapi server-tool format — unwrap arguments
    const toolCall = msg.toolCallList?.[0] || msg.toolWithToolCallList?.[0]?.toolCall;
    if (toolCall) {
      req.vapiToolCallId = toolCall.id;
      // Arguments may be an object or a JSON string
      const args = toolCall.arguments;
      req.body = (typeof args === 'string') ? JSON.parse(args) : (args || {});
      console.log(`[tool] ${toolCall.name || req.path} id=${toolCall.id} args=${JSON.stringify(req.body)}`);
    }
  } else {
    // Direct / test call — body is already flat
    console.log(`[tool] ${req.path} (direct) body=${JSON.stringify(req.body)}`);
  }

  // ── Response wrapper ──────────────────────────────────────────────────────
  // Intercept res.json() calls from route handlers and format them for Vapi.
  // Vapi expects: { results: [{ toolCallId: "xxx", result: "string" }] }
  // Direct tests get:  { result: "string" }
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    const resultText = data?.message || (data?.error ? `Error: ${data.error}` : 'No data returned.');
    console.log(`[tool-response] ${req.path} → ${resultText.slice(0, 150)}`);

    res.status(200); // Always 200 — Vapi ignores non-200 tool responses

    if (req.vapiToolCallId) {
      // Vapi server-tool response format
      return originalJson({
        results: [{ toolCallId: req.vapiToolCallId, result: resultText }]
      });
    } else {
      // Direct / test format
      return originalJson({ result: resultText });
    }
  };

  next();
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'tap-tandoor-voice-middleware' }));

// ─── Site Resolution ──────────────────────────────────────────────────────────
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

// ─── Tool Routes ──────────────────────────────────────────────────────────────
app.post('/tools/check_availability', vapiAuth, checkAvailability);
app.post('/tools/get_occasions',       vapiAuth, getOccasions);
app.post('/tools/get_allergens',       vapiAuth, getAllergens);
app.post('/tools/check_guest_blocked', vapiAuth, checkGuestBlocked);
app.post('/tools/create_booking',      vapiAuth, createBooking);
app.post('/tools/lookup_booking',      vapiAuth, lookupBooking);
app.post('/tools/cancel_booking',      vapiAuth, cancelBookingHandler);
app.post('/tools/join_waitlist',       vapiAuth, joinWaitlist);
app.post('/tools/get_offers',          vapiAuth, getOffers);

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

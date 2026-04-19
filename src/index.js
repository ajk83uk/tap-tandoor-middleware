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
// Vapi sends tool calls in a nested envelope. We extract arguments into req.body
// and store the toolCallId so the response wrapper can return the correct format.
//
// Vapi format (what we receive):
//   { message: { type: "tool-calls", toolCallList: [{ id, name, arguments: {...} }] } }
// OR variations:
//   toolWithToolCallList: [{ toolCall: { id, function: { name, arguments } } }]
//
// Expected response format:
//   { results: [{ toolCallId: "xxx", result: "string" }] }
app.use('/tools', (req, res, next) => {
  // Always log the raw body first so we can diagnose format issues
  console.log(`[vapi-raw] ${req.path} | ${JSON.stringify(req.body).slice(0, 600)}`);

  const msg = req.body?.message;

  if (msg?.type === 'tool-calls') {
    // ── Try every known Vapi property name for the tool call list ──────────
    let toolCall = null;

    // Format A: toolCallList (documented format)
    if (msg.toolCallList?.length) {
      toolCall = msg.toolCallList[0];
    }
    // Format B: toolWithToolCallList (alternative documented format)
    else if (msg.toolWithToolCallList?.length) {
      const entry = msg.toolWithToolCallList[0];
      toolCall = entry.toolCall || entry;
    }
    // Format C: direct toolCalls array (OpenAI-style)
    else if (msg.toolCalls?.length) {
      const tc = msg.toolCalls[0];
      // OpenAI style has function.name and function.arguments
      if (tc.function) {
        toolCall = {
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        };
      } else {
        toolCall = tc;
      }
    }

    if (toolCall) {
      req.vapiToolCallId = toolCall.id;
      // arguments can be an object or a JSON string
      const rawArgs = toolCall.arguments ?? toolCall.args ?? {};
      req.body = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
      console.log(`[vapi-tool] ${toolCall.name || req.path} id=${toolCall.id} args=${JSON.stringify(req.body)}`);
    } else {
      console.warn(`[vapi-warn] tool-calls message but no toolCall found. msg keys: ${Object.keys(msg).join(', ')}`);
    }
  }
  // else: direct/test call — req.body already flat, no vapiToolCallId set

  // ── Response wrapper ──────────────────────────────────────────────────────
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    const resultText = data?.message || (data?.error ? `Error: ${data.error}` : 'No data returned.');
    console.log(`[vapi-resp] ${req.path} → ${resultText.slice(0, 200)}`);

    res.status(200); // Always HTTP 200 — Vapi ignores non-200 tool responses

    if (req.vapiToolCallId) {
      // Vapi server-tool format: { results: [{ toolCallId, result }] }
      return originalJson({
        results: [{ toolCallId: req.vapiToolCallId, result: resultText }]
      });
    } else {
      // Direct / curl test format
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
  if (!toNumber) return res.status(400).json({ error: 'toNumber is required' });

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

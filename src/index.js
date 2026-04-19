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

// Use verify callback to capture raw body WITHOUT double-consuming the stream
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// ─── Vapi Tool Request Normaliser ─────────────────────────────────────────────
// Vapi sends tool calls in a nested envelope:
//   { message: { type: "tool-calls", toolCallList: [{ id, name, parameters: {...} }] } }
// We extract parameters into req.body (flat) and store toolCallId for the response.
// Response must be: { results: [{ toolCallId: "xxx", result: "string" }] }
app.use('/tools', (req, res, next) => {
  // Log raw body so we can diagnose any remaining issues
  console.log(`[vapi-raw] ${req.path} ct=${req.headers['content-type']} len=${req.headers['content-length']} body=${(req.rawBody || '').slice(0, 500)}`);

  const msg = req.body?.message;

  if (msg?.type === 'tool-calls') {
    let toolCall = null;

    // Format A: toolCallList (documented format — params in .parameters)
    if (msg.toolCallList?.length) {
      toolCall = msg.toolCallList[0];
    }
    // Format B: toolWithToolCallList
    else if (msg.toolWithToolCallList?.length) {
      const entry = msg.toolWithToolCallList[0];
      toolCall = entry.toolCall || entry;
    }
    // Format C: OpenAI-style toolCalls with function.arguments
    else if (msg.toolCalls?.length) {
      const tc = msg.toolCalls[0];
      toolCall = tc.function
        ? { id: tc.id, name: tc.function.name, parameters: tc.function.arguments }
        : tc;
    }

    if (toolCall) {
      req.vapiToolCallId = toolCall.id;
      // Vapi docs say "parameters", but also handle "arguments" for safety
      const rawArgs = toolCall.parameters ?? toolCall.arguments ?? toolCall.args ?? {};
      req.body = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
      console.log(`[vapi-tool] ${toolCall.name || req.path} id=${toolCall.id} args=${JSON.stringify(req.body)}`);
    } else {
      console.warn(`[vapi-warn] tool-calls message but no toolCall. Keys: ${Object.keys(msg).join(', ')}`);
    }
  } else {
    // Not a Vapi nested call — req.body is already flat (direct/test call)
    if (req.rawBody) console.log(`[vapi-direct] ${req.path} body=${req.rawBody.slice(0, 200)}`);
  }

  // ── Response wrapper ──────────────────────────────────────────────────────
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    const resultText = data?.message || (data?.error ? `Error: ${data.error}` : 'No data returned.');
    console.log(`[vapi-resp] ${req.path} → ${resultText.slice(0, 200)}`);
    res.status(200);
    if (req.vapiToolCallId) {
      return originalJson({ results: [{ toolCallId: req.vapiToolCallId, result: resultText }] });
    }
    return originalJson({ result: resultText });
  };

  next();
});

// ─── Debug echo ───────────────────────────────────────────────────────────────
app.post('/tools/debug_echo', (req, res) => {
  const info = {
    contentType: req.headers['content-type'],
    rawBody: req.rawBody || '(empty)',
    parsedBody: req.body,
    vapiToolCallId: req.vapiToolCallId || null,
  };
  console.log('[debug_echo]', JSON.stringify(info));
  res.json({ message: 'DEBUG:' + JSON.stringify(info) });
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

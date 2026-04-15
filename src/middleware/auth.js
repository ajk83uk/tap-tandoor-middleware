// ─── Vapi Webhook Authentication ──────────────────────────────────────────────
// Validates that incoming requests are genuinely from Vapi, not spoofed calls

function vapiAuth(req, res, next) {
  // In development with no secret set, skip auth
  if (!process.env.VAPI_SECRET || process.env.NODE_ENV === 'development') {
    return next();
  }

  const secret = req.headers['x-vapi-secret'];
  if (!secret || secret !== process.env.VAPI_SECRET) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  next();
}

module.exports = { vapiAuth };

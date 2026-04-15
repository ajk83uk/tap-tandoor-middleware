// ─── Tool: join_waitlist ───────────────────────────────────────────────────────
// Used when no timeslots are available — adds the caller to the waitlist.

const { getWaitingSlotList, insertWaiting } = require('../ft-client');

async function joinWaitlist(req, res) {
  const { siteCode, shiftCode, bookingDate, bookingTime, guestCount, firstName, lastName, tel, email, shiftName } = req.body;

  const missing = ['siteCode', 'shiftCode', 'bookingDate', 'bookingTime', 'guestCount', 'firstName', 'lastName', 'tel']
    .filter(f => !req.body[f]);
  if (missing.length > 0) {
    return res.status(400).json({ success: false, error: `Missing fields: ${missing.join(', ')}` });
  }

  try {
    const result = await insertWaiting({
      siteCode, shiftCode, bookingDate, bookingTime,
      guestCount, firstName, lastName, tel,
      email: email || '',
      shiftName: shiftName || '',
    });

    const waitingCode = result?.WaitingCode || 'N/A';

    return res.json({
      success: true,
      waitingCode,
      message: `You've been added to our waitlist for ${bookingDate}. We'll contact you on ${tel} if a table becomes available. Your waitlist reference is ${waitingCode}.`,
    });

  } catch (err) {
    console.error('[join_waitlist]', err.message);
    return res.status(500).json({ success: false, error: 'Could not add you to the waitlist. Please try again.' });
  }
}

module.exports = { joinWaitlist };

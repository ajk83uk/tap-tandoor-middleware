// ─── Tool: check_availability ─────────────────────────────────────────────────
// Called by the LLM to find available dates, shifts, and timeslots.
// Single endpoint that chains GetDateList → GetShiftList → GetTimeslotList
// Returns a clean, voice-friendly summary back to Vapi.

const { getDateList, getShiftList, getTimeslotList } = require('../ft-client');

async function checkAvailability(req, res) {
  const { siteCode, shiftCode, guestCount } = req.body;
  const bookingDate = normaliseDateString(req.body.bookingDate);

  try {
    // ── Step 1: If no date given, return next 14 days of available dates ───────
    if (!bookingDate) {
      const today = new Date();
      const in14 = new Date(today);
      in14.setDate(today.getDate() + 14);

      const dateResult = await getDateList({
        siteCode,
        startDate: formatDate(today),
        endDate: formatDate(in14),
      });

      const availableDates = (dateResult.ResultInfo || dateResult.DateList || [])
        .filter(d => d.IsAvailable)
        .map(d => d.BookingDate)
        .slice(0, 7); // cap at 7 to keep voice response concise

      return res.json({
        success: true,
        type: 'dates',
        availableDates,
        message: availableDates.length > 0
          ? `We have availability on: ${availableDates.join(', ')}.`
          : 'Unfortunately we have no availability in the next 14 days.',
      });
    }

    // ── Step 2: If date given but no shift, return available shifts ───────────
    if (bookingDate && !shiftCode) {
      const shiftResult = await getShiftList({ siteCode, bookingDate });
      const shifts = (shiftResult.ResultInfo || shiftResult.ShiftList || []).map(s => ({
        shiftCode: s.ShiftCode,
        shiftName: s.ShiftName,
        startTime: s.StartTime,
        endTime: s.EndTime,
        isAvailable: s.IsAvailable,
      })).filter(s => s.isAvailable);

      return res.json({
        success: true,
        type: 'shifts',
        bookingDate,
        shifts,
        message: shifts.length > 0
          ? `On ${bookingDate} we have: ${shifts.map(s => s.shiftName).join(' and ')}.`
          : `Unfortunately we have no availability on ${bookingDate}.`,
      });
    }

    // ── Step 3: Date + shift + guest count → return timeslots ────────────────
    if (bookingDate && shiftCode && guestCount) {
      const slotResult = await getTimeslotList({ siteCode, shiftCode, bookingDate, guestCount });
      const slots = (slotResult.ResultInfo || slotResult.TimeSlotList || []).map(s => ({
        time: s.BookingTime,
        duration: s.Duration,
        available: s.AvailableBookings > 0,
      })).filter(s => s.available);

      return res.json({
        success: true,
        type: 'timeslots',
        bookingDate,
        shiftCode,
        guestCount,
        slots,
        message: slots.length > 0
          ? `Available times for ${guestCount} guests on ${bookingDate}: ${slots.map(s => s.time).join(', ')}.`
          : `Sorry, no tables available for ${guestCount} guests on ${bookingDate} for that session.`,
      });
    }

    return res.status(400).json({ success: false, error: 'Provide at least siteCode. Optionally include bookingDate and shiftCode for more specific availability.' });

  } catch (err) {
    console.error('[check_availability]', err.message);
    return res.status(500).json({ success: false, error: 'Could not check availability. Please try again.' });
  }
}

// FavouriteTable expects dates in yyyyMMdd format (e.g. 20260417)
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// Normalise any incoming date string to yyyyMMdd
// Accepts: yyyyMMdd, yyyy-MM-dd, yyyy/MM/dd
function normaliseDateString(str) {
  if (!str) return str;
  const clean = str.replace(/[-\/]/g, '');
  return clean; // strips dashes/slashes → yyyyMMdd
}

module.exports = { checkAvailability };

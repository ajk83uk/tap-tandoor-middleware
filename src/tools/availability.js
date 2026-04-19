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

      // ResultInfo is { DateList: ["20260417", ...] } — extract the array
      const dateList = dateResult.ResultInfo?.DateList || dateResult.DateList || [];
      const availableDates = dateList.slice(0, 7); // cap at 7 for voice
      const friendlyDates = availableDates.map(friendlyDate);

      return res.json({
        success: true,
        type: 'dates',
        availableDates,
        message: availableDates.length > 0
          ? `We have availability on: ${friendlyDates.join(', ')}.`
          : 'Unfortunately we have no availability in the next 14 days.',
      });
    }

    // ── Step 2: If date given but no shift, return available shifts ───────────
    if (bookingDate && !shiftCode) {
      const shiftResult = await getShiftList({ siteCode, bookingDate });
      // ResultInfo is { ShiftList: [{ShiftCode, ShiftName, ...}] }
      const shiftList = shiftResult.ResultInfo?.ShiftList || shiftResult.ShiftList || [];
      const shifts = shiftList.map(s => ({
        shiftCode: s.ShiftCode,
        shiftName: s.ShiftName,
        startTime: s.ShiftStartTime,
        endTime: s.ShiftEndTime,
      }));

      return res.json({
        success: true,
        type: 'shifts',
        bookingDate,
        shifts,
        message: shifts.length > 0
          ? `On ${friendlyDate(bookingDate)} we have: ${shifts.map(s => s.shiftName).join(' and ')}.`
          : `Unfortunately we have no availability on ${friendlyDate(bookingDate)}.`,
      });
    }

    // ── Step 3: Date + shift → return timeslots (guestCount optional, defaults to 2)
    if (bookingDate && shiftCode) {
      const guests = guestCount || 2;
      const slotResult = await getTimeslotList({ siteCode, shiftCode, bookingDate, guestCount: guests });
      // ResultInfo is { TimeSlotList: [{BookingTime, Duration, AvailableBookings, ...}] }
      const slotList = slotResult.ResultInfo?.TimeSlotList || slotResult.TimeSlotList || [];
      const allSlots = slotList.map(s => ({
        time: s.BookingTime,                      // raw seconds (for create_booking)
        display: s.DisplayBookingTime || friendlyTime(s.BookingTime), // "19:00" (for voice)
        available: s.AvailableBookings > 0,
      })).filter(s => s.available);

      // Cap at 4 slots to keep the AI response short and snappy
      const slots = allSlots.slice(0, 4);

      return res.json({
        success: true,
        type: 'timeslots',
        bookingDate,
        shiftCode,
        guestCount,
        slots,
        message: slots.length > 0
          ? `Available times on ${friendlyDate(bookingDate)}: ${slots.map(s => s.display).join(', ')}${allSlots.length > 4 ? ' and more.' : '.'}`
          : `Sorry, no tables available for ${guests} guests on ${friendlyDate(bookingDate)}.`,
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
  return str.replace(/[-\/]/g, '');
}

// Convert yyyyMMdd → "Friday 17 April 2026" (voice-friendly)
function friendlyDate(str) {
  if (!str || str.length !== 8) return str;
  const y = str.slice(0, 4), mo = str.slice(4, 6), d = str.slice(6, 8);
  const dt = new Date(`${y}-${mo}-${d}`);
  return dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Convert seconds-since-midnight → "6:00 PM" (voice-friendly)
function friendlyTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

module.exports = { checkAvailability };

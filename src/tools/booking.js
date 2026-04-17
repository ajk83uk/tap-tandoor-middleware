// ─── Tools: create_booking, lookup_booking, cancel_booking ────────────────────

const { insertBooking, cancelBooking, searchBooking, getBookingByGuid } = require('../ft-client');
const { COMPANY_CODE, SALE_CHANNEL_CODE } = require('../config');

// ─── Create Booking ───────────────────────────────────────────────────────────
async function createBooking(req, res) {
  const {
    siteCode,
    shiftCode,
    bookingTime,
    guestCount,
    firstName,
    lastName,
    tel,
    email,
    occasionTypeCode,  // optional
    allergenValues,    // optional — array of ints
    specialRequest,    // optional
    locationCode,      // optional
  } = req.body;

  // Normalise date to yyyyMMdd (FT requirement)
  const bookingDate = (req.body.bookingDate || '').replace(/[-\/]/g, '');

  // Basic validation
  const missing = ['siteCode', 'shiftCode', 'bookingDate', 'bookingTime', 'guestCount', 'firstName', 'lastName', 'tel']
    .filter(field => !req.body[field]);
  if (missing.length > 0) {
    return res.status(400).json({ success: false, error: `Missing required fields: ${missing.join(', ')}` });
  }

  try {
    const result = await insertBooking({
      SiteCode: siteCode,
      ShiftCode: shiftCode,
      BookingDate: bookingDate,
      BookingTime: bookingTime,
      GuestCount: guestCount,
      FirstName: firstName,
      LastName: lastName,
      Tel: tel,
      Email: email || '',
      OccasionTypeCode: occasionTypeCode || 0,
      AllergenValues: allergenValues || [],
      SpecialRequest: specialRequest || '',
      LocationCode: locationCode || 0,
      IsNoAllergen: !allergenValues || allergenValues.length === 0,
      // Sales channel — voice booking channel code
      SaleChannelCode: SALE_CHANNEL_CODE,
    });

    const bk    = result?.ResultInfo || result?.Booking || result;
    const refNo = bk?.BookingRefNo || 'N/A';
    const guid  = bk?.BookingGuidCode || '';

    return res.json({
      success: true,
      bookingRefNo: refNo,
      bookingGuid: guid,
      message: `Booking confirmed! Your reference number is ${refNo}. A confirmation will be sent to ${email || 'the number provided'}.`,
    });

  } catch (err) {
    console.error('[create_booking]', err.message, err.data);
    return res.status(500).json({
      success: false,
      error: 'We were unable to complete the booking. Please try again or call us directly.',
    });
  }
}

// ─── Lookup Booking ───────────────────────────────────────────────────────────
async function lookupBooking(req, res) {
  const { email, bookingRefNo, bookingGuid } = req.body;

  if (!email && !bookingRefNo && !bookingGuid) {
    return res.status(400).json({ success: false, error: 'Provide email, bookingRefNo, or bookingGuid.' });
  }

  try {
    let result;

    if (bookingGuid) {
      result = await getBookingByGuid(bookingGuid);
    } else {
      result = await searchBooking({ email: email || '', bookingRefNo: bookingRefNo || '', companyCode: COMPANY_CODE });
    }

    const booking = result?.ResultInfo || result?.Booking || result;
    if (!booking || !booking.BookingRefNo) {
      return res.json({ success: false, message: 'No booking found with those details.' });
    }

    return res.json({
      success: true,
      bookingRefNo: booking.BookingRefNo,
      bookingGuid: booking.BookingGuidCode,
      date: booking.BookingDate,
      time: booking.BookingTime,
      guestCount: booking.GuestCount,
      firstName: booking.FirstName,
      lastName: booking.LastName,
      siteName: booking.SiteName || '',
      status: booking.BookingStatusName || '',
      message: `I found a booking for ${booking.FirstName} ${booking.LastName} — ${booking.GuestCount} guests on ${booking.BookingDate} at ${booking.BookingTime}. Reference: ${booking.BookingRefNo}.`,
    });

  } catch (err) {
    console.error('[lookup_booking]', err.message);
    return res.status(500).json({ success: false, error: 'Could not look up that booking. Please try again.' });
  }
}

// ─── Cancel Booking ───────────────────────────────────────────────────────────
async function cancelBookingHandler(req, res) {
  const { bookingGuid, email, bookingRefNo } = req.body;

  if (!bookingGuid && !bookingRefNo) {
    return res.status(400).json({ success: false, error: 'Provide bookingGuid or bookingRefNo to cancel.' });
  }

  try {
    await cancelBooking({
      companyCode: COMPANY_CODE,
      bookingGuidCode: bookingGuid || '',
      email: email || '',
      bookingRefNo: bookingRefNo || '',
    });

    return res.json({
      success: true,
      message: `Your booking has been cancelled. You'll receive a confirmation shortly.`,
    });

  } catch (err) {
    console.error('[cancel_booking]', err.message);
    return res.status(500).json({ success: false, error: 'We could not cancel that booking. Please call us directly to cancel.' });
  }
}

module.exports = { createBooking, lookupBooking, cancelBookingHandler };

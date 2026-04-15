// ─── FavouriteTable API Client ─────────────────────────────────────────────────
// Handles dual authentication: Bearer Token + ApiKey header
// All requests go through this single client for consistency

const fetch = require('node-fetch');
const { SALE_CHANNEL_CODE } = require('./config');

const BASE_URL = process.env.FT_BASE_URL || 'https://demo.favouritetable.com/WebApi';

/**
 * Core request function — injects both auth headers on every call.
 */
async function ftRequest(endpoint, method = 'GET', body = null) {
  const url = `${BASE_URL}${endpoint}`;

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${process.env.FT_AUTH_TOKEN}`,
      'ApiKey': process.env.FT_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  // FavouriteTable returns 200 even for some errors — always parse the body
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new FTApiError(`FT API error ${response.status} on ${method} ${endpoint}`, response.status, data);
  }

  return data;
}

class FTApiError extends Error {
  constructor(message, statusCode, data) {
    super(message);
    this.name = 'FTApiError';
    this.statusCode = statusCode;
    this.data = data;
  }
}

// ─── Availability ──────────────────────────────────────────────────────────────

/** Get available booking dates for a site within a date range */
async function getDateList({ siteCode, startDate, endDate, offerCode = 0 }) {
  return ftRequest('/Booking/GetDateList', 'POST', {
    SiteCode: siteCode,
    StartDate: startDate,
    EndDate: endDate,
    OfferCode: offerCode,
    SaleChannelCode: SALE_CHANNEL_CODE,
    IsShowOnlyOffer: false,
  });
}

/** Get available shifts (Lunch / Dinner) for a given date */
async function getShiftList({ siteCode, bookingDate, offerCode = 0 }) {
  return ftRequest('/Booking/GetShiftList', 'POST', {
    SiteCode: siteCode,
    BookingDate: bookingDate,
    OfferCode: offerCode,
    SaleChannelCode: SALE_CHANNEL_CODE,
    IsShowOnlyOffer: false,
  });
}

/** Get available timeslots for a date + shift + party size */
async function getTimeslotList({ siteCode, shiftCode, bookingDate, guestCount, locationCode = 0, offerCode = 0 }) {
  return ftRequest('/Booking/GetTimeslotList', 'POST', {
    SiteCode: siteCode,
    ShiftCode: shiftCode,
    BookingDate: bookingDate,
    GuestCount: guestCount,
    LocationCode: locationCode,
    OfferCode: offerCode,
    SaleChannelCode: SALE_CHANNEL_CODE,
    IsRequireDisableAccess: false,
    IsPetFriendly: false,
  });
}

// ─── Lookups ───────────────────────────────────────────────────────────────────

/** Get special occasion types (birthday, anniversary, etc.) */
async function getOccasionList(companyCode) {
  return ftRequest(`/Lookup/GetOccassionList?companyCode=${companyCode}`);
}

/** Get allergen options for a site */
async function getAllergenList(siteCode) {
  return ftRequest(`/Booking/GetAllergenList?siteCode=${siteCode}`);
}

/** Get seating area / location options */
async function getLocationList(siteCode) {
  return ftRequest(`/Booking/GetLocationList?siteCode=${siteCode}`);
}

/** Get site settings and configuration */
async function getSettingDetail(companyCode, siteCode) {
  return ftRequest(`/Booking/GetSettingDetail?companyCode=${companyCode}&siteCode=${siteCode}`);
}

// ─── Guest ────────────────────────────────────────────────────────────────────

/** Check if a guest is blocked from booking */
async function isGuestBlocked({ companyCode, email = '', phone = '' }) {
  return ftRequest(`/Booking/IsGuestBlocked?companyCode=${companyCode}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}&customerCode=`);
}

// ─── Booking CRUD ─────────────────────────────────────────────────────────────

/** Create a new booking */
async function insertBooking(bookingDetail) {
  return ftRequest('/Booking/Insert', 'POST', {
    BookingCode: 0,
    Booking: bookingDetail,
  });
}

/** Update an existing booking */
async function updateBooking(bookingDetail) {
  return ftRequest('/Booking/Update', 'POST', {
    BookingCode: bookingDetail.BookingCode || 0,
    Booking: bookingDetail,
  });
}

/** Cancel a booking */
async function cancelBooking({ companyCode, bookingGuidCode, email, bookingRefNo }) {
  return ftRequest('/Booking/Cancel', 'POST', {
    CompanyCode: companyCode,
    BookingGuidCode: bookingGuidCode || '',
    Email: email || '',
    BookingRefNo: bookingRefNo || '',
  });
}

/** Search for a booking by email and/or reference number */
async function searchBooking({ email = '', bookingRefNo = '', companyCode }) {
  const params = new URLSearchParams({ email, bookingRefNo, companyCode }).toString();
  return ftRequest(`/Booking/Search?${params}`);
}

/** Get full booking details by GUID */
async function getBookingByGuid(bookingGUID) {
  return ftRequest(`/Booking/GetBookingDetailByGUID?bookingGUID=${bookingGUID}`);
}

// ─── Waitlist ─────────────────────────────────────────────────────────────────

/** Get available waitlist slots */
async function getWaitingSlotList({ siteCode, shiftCode, bookingDate, guestCount }) {
  return ftRequest('/Booking/GetWaitingimeSlotList', 'POST', {
    SiteCode: siteCode,
    ShiftCode: shiftCode,
    BookingDate: bookingDate,
    GuestCount: guestCount,
  });
}

/** Add a guest to the waitlist */
async function insertWaiting({ siteCode, shiftCode, bookingDate, bookingTime, guestCount, firstName, lastName, tel, email, shiftName }) {
  return ftRequest('/Booking/InsertWaiting', 'POST', {
    SiteCode: siteCode,
    ShiftCode: shiftCode,
    BookingDate: bookingDate,
    BookingTime: bookingTime,
    GuestCount: guestCount,
    FirstName: firstName,
    LastName: lastName,
    Tel: tel,
    Email: email || '',
    ShiftName: shiftName || '',
  });
}

module.exports = {
  ftRequest,
  FTApiError,
  // Availability
  getDateList,
  getShiftList,
  getTimeslotList,
  // Lookups
  getOccasionList,
  getAllergenList,
  getLocationList,
  getSettingDetail,
  // Guest
  isGuestBlocked,
  // Bookings
  insertBooking,
  updateBooking,
  cancelBooking,
  searchBooking,
  getBookingByGuid,
  // Waitlist
  getWaitingSlotList,
  insertWaiting,
};

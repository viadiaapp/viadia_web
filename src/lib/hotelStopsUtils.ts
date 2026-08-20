import { Trip, Place } from '../types';

export interface StayPeriod {
  id: string;
  hotelName: string;
  address: string;
  lat: number;
  lng: number;
  checkInTime: string;
  checkOutTime: string;
  checkInDate: string;
  checkOutDate: string;
}

/**
 * Extracts stay periods from a trip's timeline entries where isStay === true.
 */
export function extractStayPeriods(timeline: Place[] = [], fallbackTripEndDate?: string): StayPeriod[] {
  const stayMap = new Map<string, StayPeriod>();

  timeline.forEach((p) => {
    if (!p.isStay) return;

    // Stem ID to group check-in and check-out entries for the same stay
    const stemId = p.id ? p.id.replace(/-in$|-out$/, '') : `stay-${p.title}`;
    const name = p.hotelName || p.title.replace(/^Check (in|out) at /i, '') || 'Accommodation';
    const address = p.stayAddress || p.address || '';
    const lat = Number(p.stayLat ?? p.lat ?? 0);
    const lng = Number(p.stayLng ?? p.lng ?? 0);

    const isOutEntry = p.id?.endsWith('-out') || p.title?.toLowerCase().startsWith('check out');
    const inTime = p.checkInTime || (!isOutEntry ? p.time : '') || '';
    const outTime = p.checkOutTime || (isOutEntry ? p.time : '') || '';

    const inDate = inTime ? inTime.slice(0, 10) : '';
    const outDate = outTime ? outTime.slice(0, 10) : '';

    if (!stayMap.has(stemId)) {
      stayMap.set(stemId, {
        id: stemId,
        hotelName: name,
        address,
        lat,
        lng,
        checkInTime: inTime,
        checkOutTime: outTime,
        checkInDate: inDate,
        checkOutDate: outDate,
      });
    } else {
      const existing = stayMap.get(stemId)!;
      if (!existing.checkInTime && inTime) {
        existing.checkInTime = inTime;
        existing.checkInDate = inDate;
      }
      if (isOutEntry && outTime) {
        existing.checkOutTime = outTime;
        existing.checkOutDate = outDate;
      } else if (!existing.checkOutTime && outTime) {
        existing.checkOutTime = outTime;
        existing.checkOutDate = outDate;
      }
      if (!existing.address && address) existing.address = address;
      if (!existing.lat && lat) existing.lat = lat;
      if (!existing.lng && lng) existing.lng = lng;
    }
  });

  const sortedStays = Array.from(stayMap.values()).sort((a, b) => {
    const tA = a.checkInTime || a.checkInDate;
    const tB = b.checkInTime || b.checkInDate;
    return tA.localeCompare(tB);
  });

  // Resolve missing checkOutDate for stays
  sortedStays.forEach((stay, idx) => {
    if (!stay.checkOutDate || stay.checkOutDate <= stay.checkInDate) {
      if (idx < sortedStays.length - 1 && sortedStays[idx + 1].checkInDate) {
        stay.checkOutDate = sortedStays[idx + 1].checkInDate;
      } else if (fallbackTripEndDate && fallbackTripEndDate > stay.checkInDate) {
        stay.checkOutDate = fallbackTripEndDate;
      } else if (stay.checkInDate) {
        const inD = new Date(stay.checkInDate);
        inD.setDate(inD.getDate() + 1);
        const yyyy = inD.getFullYear();
        const mm = String(inD.getMonth() + 1).padStart(2, '0');
        const dd = String(inD.getDate()).padStart(2, '0');
        stay.checkOutDate = `${yyyy}-${mm}-${dd}`;
      }
    }
  });

  return sortedStays;
}

export function extractHHMM(timeStr?: string): string | null {
  if (!timeStr) return null;
  if (timeStr.includes('T')) {
    const timePart = timeStr.split('T')[1];
    if (timePart && timePart.length >= 5) {
      const hhmm = timePart.slice(0, 5);
      if (/^\d{2}:\d{2}$/.test(hhmm)) return hhmm;
    }
  }
  if (/^\d{2}:\d{2}/.test(timeStr)) {
    return timeStr.slice(0, 5);
  }
  return null;
}

function getCheckoutHHMMForDate(morningStay: StayPeriod, currentDateStr: string, timeline: Place[]): string | null {
  // 1. Look for explicit checkout place in timeline for this date
  const outPlace = timeline.find((p) => {
    if (!p.time || !p.time.startsWith(currentDateStr)) return false;
    const isOut = p.id?.endsWith('-out') || p.title?.toLowerCase().startsWith('check out');
    if (!isOut) return false;
    const stemMatch = Boolean(p.id && morningStay.id && p.id.startsWith(morningStay.id));
    const nameMatch = Boolean(morningStay.hotelName && p.title.toLowerCase().includes(morningStay.hotelName.toLowerCase()));
    return stemMatch || nameMatch || Boolean(p.isStay);
  });

  if (outPlace?.time) {
    const hhmm = extractHHMM(outPlace.time);
    if (hhmm) return hhmm;
  }

  // 2. Check morningStay.checkOutTime if it applies to currentDateStr
  if (morningStay.checkOutTime) {
    if (morningStay.checkOutTime.startsWith(currentDateStr) || morningStay.checkOutDate === currentDateStr) {
      const hhmm = extractHHMM(morningStay.checkOutTime);
      if (hhmm) return hhmm;
    }
  }

  return null;
}

/**
 * Reconciles auto daily hotel start and end stops in trip.timeline.
 *
 * Rules:
 * 1. Morning start entry created ONLY AFTER checkInDate (i.e. currentDateStr > checkInDate && currentDateStr <= checkOutDate).
 * 2. Evening end entry created ONLY BEFORE checkOutDate (i.e. currentDateStr >= checkInDate && currentDateStr < checkOutDate).
 * 3. Supports multiple hotels naturally based on each stay's checkin and checkout dates.
 * 4. Preserves user-customized entries (isCustomized === true) and deleted entries (in removedDailyHotelStopIds).
 * 5. If checkout time on the morning stay's checkout day is BEFORE the daily hotel start time, automatically set the daily hotel start time equal to the checkout time.
 */
export function reconcileDailyHotelStops(trip: Trip): Trip {
  const enabled = trip.enableHotelDailyStops ?? false;
  const removedIds = new Set(trip.removedDailyHotelStopIds || []);

  // Filter existing timeline: keep non-daily-hotel stops AND customized daily-hotel stops that were not removed
  const cleanTimeline = (trip.timeline || []).filter((p) => {
    if (!p.isDailyHotelStop && !p.id.startsWith('auto-hotel-')) {
      return true;
    }
    if (p.isDailyHotelStop && p.isCustomized && !removedIds.has(p.id)) {
      return true;
    }
    return false;
  });

  if (!enabled || !trip.startDate || !trip.endDate) {
    return {
      ...trip,
      timeline: cleanTimeline,
    };
  }

  const startTime = trip.hotelDailyStartTime || '09:00';
  const endTime = trip.hotelDailyEndTime || '21:00';

  const stays = extractStayPeriods(cleanTimeline, trip.endDate);

  const newHotelStops: Place[] = [];
  const startD = new Date(trip.startDate);
  const endD = new Date(trip.endDate);

  if (isNaN(startD.getTime()) || isNaN(endD.getTime())) {
    return { ...trip, timeline: cleanTimeline };
  }

  const curr = new Date(startD);
  while (curr <= endD) {
    const yyyy = curr.getFullYear();
    const mm = String(curr.getMonth() + 1).padStart(2, '0');
    const dd = String(curr.getDate()).padStart(2, '0');
    const currentDateStr = `${yyyy}-${mm}-${dd}`;

    // Requirement 1 & 3: Morning Start Stop
    // First start entry created ONLY AFTER checkin date (currentDateStr > s.checkInDate) and <= checkOutDate
    const morningStay = stays.find((s) => {
      return currentDateStr > s.checkInDate && currentDateStr <= s.checkOutDate;
    });

    if (morningStay) {
      let dayStartTime = startTime;
      const coHHMM = getCheckoutHHMMForDate(morningStay, currentDateStr, cleanTimeline);
      if (coHHMM && coHHMM < dayStartTime) {
        dayStartTime = coHHMM;
      }

      const stopId = `auto-hotel-start-${currentDateStr}`;
      const alreadyHasCustom = cleanTimeline.some(
        (p) => p.isDailyHotelStop && p.hotelStopType === 'start' && p.time?.startsWith(currentDateStr)
      );
      if (!removedIds.has(stopId) && !alreadyHasCustom) {
        newHotelStops.push({
          id: stopId,
          title: `Start at ${morningStay.hotelName}`,
          description: `Daily start at ${morningStay.hotelName}`,
          time: `${currentDateStr}T${dayStartTime}`,
          address: morningStay.address,
          lat: morningStay.lat,
          lng: morningStay.lng,
          isDailyHotelStop: true,
          hotelStopType: 'start',
          linkedStayId: morningStay.id,
        });
      }
    }

    // Requirement 2 & 3: Evening End Stop
    // Last end entry created ONLY BEFORE checkout date (currentDateStr < s.checkOutDate) and >= checkInDate
    const eveningStay = stays.find((s) => {
      return currentDateStr >= s.checkInDate && currentDateStr < s.checkOutDate;
    });

    if (eveningStay) {
      const stopId = `auto-hotel-end-${currentDateStr}`;
      const alreadyHasCustom = cleanTimeline.some(
        (p) => p.isDailyHotelStop && p.hotelStopType === 'end' && p.time?.startsWith(currentDateStr)
      );
      if (!removedIds.has(stopId) && !alreadyHasCustom) {
        newHotelStops.push({
          id: stopId,
          title: `End at ${eveningStay.hotelName}`,
          description: `Daily return to ${eveningStay.hotelName}`,
          time: `${currentDateStr}T${endTime}`,
          address: eveningStay.address,
          lat: eveningStay.lat,
          lng: eveningStay.lng,
          isDailyHotelStop: true,
          hotelStopType: 'end',
          linkedStayId: eveningStay.id,
        });
      }
    }

    curr.setDate(curr.getDate() + 1);
  }

  // Combine clean timeline and new hotel stops, sorted chronologically
  const combinedTimeline = [...cleanTimeline, ...newHotelStops].sort((a, b) => {
    const tA = a.time || '';
    const tB = b.time || '';
    if (tA !== tB) return tA.localeCompare(tB);
    // Tie breaker if same date & time: 'start' daily hotel stop before 'check out' stop or other stops
    if (a.isDailyHotelStop && a.hotelStopType === 'start') return -1;
    if (b.isDailyHotelStop && b.hotelStopType === 'start') return 1;
    return 0;
  });

  return {
    ...trip,
    timeline: combinedTimeline,
  };
}

import { Trip } from '../types';
import { DEFAULT_USD_RATES } from '../data/staticCurrencies';

/**
 * Gets the exchange rate setup for a trip for a given currency relative to base currency (1 Base = X Target).
 * If target currency equals base currency, returns 1.0.
 * First checks trip.exchangeRates[targetCurrency], then falls back to static DEFAULT_USD_RATES.
 */
export function getSetupExchangeRate(
  trip: Partial<Trip> | null | undefined,
  targetCurrency: string,
  customBaseCurrency?: string
): number {
  const base = customBaseCurrency || trip?.baseCurrency || 'USD';
  if (!targetCurrency || targetCurrency === base) return 1.0;

  if (
    trip?.exchangeRates &&
    trip.exchangeRates[targetCurrency] !== undefined &&
    Number(trip.exchangeRates[targetCurrency]) > 0
  ) {
    return Number(trip.exchangeRates[targetCurrency]);
  }

  const baseUSD = DEFAULT_USD_RATES[base.toUpperCase()] || 1.0;
  const targetUSD = DEFAULT_USD_RATES[targetCurrency.toUpperCase()] || 1.0;
  const rate = Number((targetUSD / baseUSD).toFixed(6));
  return rate || 1.0;
}

/**
 * Returns today's date string in YYYY-MM-DD format using local time.
 */
export function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type TripTiming = 'future' | 'ongoing' | 'past';
export type TripCategory = 'ongoing' | 'upcoming' | 'completed' | 'cancelled';

/**
 * Categorizes a trip into one of 4 user-facing sections: ongoing, upcoming, completed, or cancelled.
 */
export function getTripCategory(
  trip: { status?: Trip['status']; startDate?: string; endDate?: string },
  todayStr?: string
): TripCategory {
  if (trip.status === 'cancelled') return 'cancelled';
  if (trip.status === 'completed') return 'completed';
  const timing = getTripTimingState(trip.startDate, trip.endDate, todayStr);
  if (timing === 'past') return 'completed';
  if (timing === 'ongoing' || trip.status === 'active') return 'ongoing';
  return 'upcoming';
}

/**
 * Determines whether a trip is in the future, ongoing (current), or past relative to today's date.
 */
export function getTripTimingState(startDate?: string, endDate?: string, todayStr?: string): TripTiming {
  const today = todayStr || getTodayString();
  const start = startDate || '';
  const end = endDate || start || '';

  if (!start && !end) return 'future';

  if (end < today) {
    return 'past';
  } else if (start <= today && end >= today) {
    return 'ongoing';
  } else {
    return 'future';
  }
}

/**
 * Gets allowed status choices for a trip based on its dates.
 * - Future trips: 'planned', 'cancelled' (Cannot be 'active' or 'completed')
 * - Ongoing trips: 'active', 'cancelled' (Active is automatically assigned; 'planned' is invalid since trip started)
 * - Past trips: 'completed', 'cancelled' (Cannot be 'planned' or 'active')
 * Note: 'cancelled' is ALWAYS available.
 */
export function getAllowedStatuses(
  startDate?: string,
  endDate?: string,
  todayStr?: string
): Array<'planned' | 'active' | 'completed' | 'cancelled'> {
  const timing = getTripTimingState(startDate, endDate, todayStr);
  switch (timing) {
    case 'future':
      return ['planned', 'cancelled'];
    case 'ongoing':
      return ['active', 'cancelled'];
    case 'past':
      return ['completed', 'cancelled'];
  }
}

/**
 * Calculates the automatically assigned status for a trip based on its dates.
 * Keeps 'cancelled' status if the trip was cancelled.
 */
export function computeAutoStatus(
  startDate?: string,
  endDate?: string,
  currentStatus?: Trip['status'],
  todayStr?: string
): Trip['status'] {
  if (currentStatus === 'cancelled') {
    return 'cancelled';
  }

  const timing = getTripTimingState(startDate, endDate, todayStr);
  switch (timing) {
    case 'ongoing':
      return 'active';
    case 'past':
      return 'completed';
    case 'future':
    default:
      return 'planned';
  }
}

/**
 * Validates whether a proposed status transition is valid for given dates.
 */
export function isStatusValidForDates(
  status: Trip['status'],
  startDate?: string,
  endDate?: string,
  todayStr?: string
): boolean {
  if (status === 'cancelled') return true; // Cancelled is always available
  const allowed = getAllowedStatuses(startDate, endDate, todayStr);
  return allowed.includes(status);
}

/**
 * Reconciles a dictionary of trips so that all non-cancelled trips match their date-dependent status.
 */
export function reconcileTripStatuses(trips: { [id: string]: Trip }): { updatedTrips: { [id: string]: Trip }; hasChanges: boolean } {
  if (!trips) return { updatedTrips: {}, hasChanges: false };
  let hasChanges = false;
  const updatedTrips: { [id: string]: Trip } = {};
  const todayStr = getTodayString();

  Object.keys(trips).forEach(id => {
    const trip = trips[id];
    const targetStatus = computeAutoStatus(trip.startDate, trip.endDate, trip.status, todayStr);
    if (trip.status !== targetStatus) {
      hasChanges = true;
      updatedTrips[id] = { ...trip, status: targetStatus };
    } else {
      updatedTrips[id] = trip;
    }
  });

  return { updatedTrips, hasChanges };
}

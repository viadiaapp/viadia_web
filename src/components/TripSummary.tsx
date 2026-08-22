import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Sun, CloudSun, CloudRain, Snowflake, Zap, Thermometer, Compass, MapPin, 
  Calendar, Sparkles, Clock, ArrowRight, Navigation, DollarSign, CheckSquare, 
  Layers, Wind, Droplets, Map, Download, ChevronRight, FileText, CheckCircle2,
  AlertCircle, Building2, Plane, Car, Train, Bus, Plus, X, Check, Utensils,
  Tag, CreditCard, Coins, AlertTriangle, Upload, Search, Sunrise, Sunset,
  Trophy, Award, Luggage, Star, Receipt, PieChart, Users, ChevronDown
} from 'lucide-react';
import { Trip, Place, Expense } from '../types';
import { generateTripPdf } from '../lib/pdfGenerator';
import { AddPlanModal } from './AddPlanModal';
import { AddExpenseModal } from './AddExpenseModal';
import { WeatherStopBottomSheet } from './WeatherStopBottomSheet';
import { reconcileDailyHotelStops } from '../lib/hotelStopsUtils';
import { getTripCategory } from '../lib/tripUtils';
import AdBanner from './AdBanner';
import { useBackButton } from '../lib/backButtonHandler';
import { fetchWeatherOnline, searchLocationsOnline } from '../lib/apiUtils';

interface TripSummaryProps {
  trip: Trip;
  trips: { [id: string]: Trip } | Trip[];
  onUpdateTrips: (updated: { [id: string]: Trip }) => void;
  activeTripId: string | null;
  onSetActiveTripId: (id: string | null) => void;
  isReadOnly?: boolean;
  onSwitchToTab: (tab: string) => void;
  onOpenMap?: (placeId?: string) => void;
  onOpenUpgradeModal?: () => void;
}

interface WeatherData {
  currentTemp: number;
  weatherCode: number;
  windSpeed: number;
  isDay: boolean;
  locationName: string;
  dateTimeStr?: string;
  sunriseStr?: string;
  sunsetStr?: string;
}

const getDefaultWeatherStopId = (currentTrip: Trip): string => {
  const now = new Date();
  const timeline = currentTrip.timeline || [];
  if (timeline.length === 0) return 'destination';

  const stopsWithTime = timeline
    .map((stop) => {
      let stopDate: Date | null = null;
      if (stop.time) {
        const d = new Date(stop.time);
        if (!isNaN(d.getTime())) stopDate = d;
      }
      return { stop, stopDate };
    })
    .filter((item): item is { stop: Place; stopDate: Date } => item.stopDate !== null)
    .sort((a, b) => a.stopDate.getTime() - b.stopDate.getTime());

  if (stopsWithTime.length === 0) {
    return timeline[0]?.id || 'destination';
  }

  const tripStartDate = currentTrip.startDate ? new Date(currentTrip.startDate) : null;
  const isBeforeTripStart =
    (tripStartDate && !isNaN(tripStartDate.getTime()) && now < tripStartDate) ||
    now < stopsWithTime[0].stopDate;

  if (isBeforeTripStart) {
    const upcoming = stopsWithTime.find((item) => item.stopDate > now) || stopsWithTime[0];
    return upcoming.stop.id;
  }

  let current = stopsWithTime[0];
  for (const item of stopsWithTime) {
    if (item.stopDate <= now) {
      current = item;
    } else {
      break;
    }
  }

  return current.stop.id;
};

export default function TripSummary({
  trip,
  trips,
  onUpdateTrips,
  activeTripId,
  onSetActiveTripId,
  isReadOnly,
  onSwitchToTab,
  onOpenMap,
  onOpenUpgradeModal,
}: TripSummaryProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>(
    () => (localStorage.getItem('temp-unit') as 'C' | 'F') || 'C'
  );

  useEffect(() => {
    const handleStorageChange = () => {
      setTempUnit((localStorage.getItem('temp-unit') as 'C' | 'F') || 'C');
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const [selectedWeatherStopId, setSelectedWeatherStopId] = useState<string>(
    () => getDefaultWeatherStopId(trip)
  );
  const [showWeatherBottomSheet, setShowWeatherBottomSheet] = useState(false);

  useEffect(() => {
    setSelectedWeatherStopId(getDefaultWeatherStopId(trip));
  }, [trip.id]);

  // Quick Action Modals State
  const [showAddPlanModal, setShowAddPlanModal] = useState(false);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);

  useBackButton('summary-weather-picker', showWeatherBottomSheet, () => setShowWeatherBottomSheet(false), 110);

  const [successToast, setSuccessToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const handleOpenAddPlan = () => {
    if (isReadOnly) return;
    setShowAddPlanModal(true);
  };

  const handleOpenAddExpense = () => {
    if (isReadOnly) return;
    setShowAddExpenseModal(true);
  };

  const formatTemp = (celsius: number) => {
    if (tempUnit === 'F') {
      return `${Math.round((celsius * 9) / 5 + 32)}°F`;
    }
    return `${Math.round(celsius)}°C`;
  };

  const getWeatherInfo = (code: number) => {
    switch (true) {
      case code === 0:
        return { label: 'Clear Sky', icon: Sun, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' };
      case code >= 1 && code <= 3:
        return { label: 'Partly Cloudy', icon: CloudSun, color: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-950/30' };
      case code >= 45 && code <= 48:
        return { label: 'Foggy', icon: Wind, color: 'text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800/40' };
      case (code >= 51 && code <= 67) || (code >= 80 && code <= 82):
        return { label: 'Rainy / Drizzle', icon: CloudRain, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30' };
      case (code >= 71 && code <= 77) || (code >= 85 && code <= 86):
        return { label: 'Snowy', icon: Snowflake, color: 'text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/30' };
      case code >= 95:
        return { label: 'Thunderstorm', icon: Zap, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950/30' };
      default:
        return { label: 'Mild / Clear', icon: Sun, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' };
    }
  };

  const tripCategory = getTripCategory(trip);
  const isCompletedTrip = tripCategory === 'completed';

  useEffect(() => {
    let isMounted = true;
    const fetchWeatherForSelectedStop = async () => {
      if (isCompletedTrip) {
        setIsLoadingWeather(false);
        return;
      }

      setIsLoadingWeather(true);
      setWeatherError(null);

      let lat: number | null = null;
      let lng: number | null = null;
      let locationName = trip.countries[0] || trip.title;
      let dateTimeStr = '';

      try {
        if (selectedWeatherStopId !== 'destination') {
          const stop = (trip.timeline || []).find((p) => p.id === selectedWeatherStopId);
          if (stop) {
            const addressCandidate = stop.address || stop.stayAddress || (stop.from ? `${stop.from}${stop.to ? ' → ' + stop.to : ''}` : undefined);
            locationName = addressCandidate || stop.title || locationName;
            if (stop.time) {
              const d = new Date(stop.time);
              if (!isNaN(d.getTime())) {
                dateTimeStr = d.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
              } else {
                dateTimeStr = stop.time.replace('T', ' ');
              }
            }

            if (typeof stop.lat === 'number' && typeof stop.lng === 'number' && (stop.lat !== 0 || stop.lng !== 0)) {
              lat = stop.lat;
              lng = stop.lng;
            } else if (addressCandidate || stop.title) {
              const query = `${addressCandidate || stop.title}, ${trip.countries[0] || ''}`;
              const geoData = await searchLocationsOnline(query, 1);
              if (geoData && geoData.length > 0) {
                lat = parseFloat(geoData[0].lat);
                lng = parseFloat(geoData[0].lon);
                if (!addressCandidate && geoData[0].display_name) {
                  locationName = geoData[0].display_name.split(',').slice(0, 3).join(', ');
                }
              }
            }
          }
        }

        if (!lat || !lng) {
          const placeWithCoords = (trip.timeline || []).find((p) => typeof p.lat === 'number' && p.lat !== 0);
          if (placeWithCoords) {
            lat = placeWithCoords.lat;
            lng = placeWithCoords.lng;
          } else {
            const searchQuery = trip.countries[0] || trip.title;
            const geoData = await searchLocationsOnline(searchQuery, 1);
            if (geoData && geoData.length > 0) {
              lat = parseFloat(geoData[0].lat);
              lng = parseFloat(geoData[0].lon);
              if (selectedWeatherStopId === 'destination') {
                locationName = geoData[0].display_name.split(',')[0] || locationName;
              }
            }
          }
        }

        if (!lat || !lng) {
          lat = 48.8566;
          lng = 2.3522;
        }

        let wData: any = null;
        try {
          wData = await fetchWeatherOnline(lat, lng);
        } catch {
          // Ignore
        }

        if (isMounted) {
          let sunriseStr: string | undefined = undefined;
          let sunsetStr: string | undefined = undefined;

          if (wData && wData.daily && wData.daily.sunrise && wData.daily.sunset) {
            const rawSunrise = wData.daily.sunrise[0];
            const rawSunset = wData.daily.sunset[0];
            if (rawSunrise) {
              const srDate = new Date(rawSunrise);
              if (!isNaN(srDate.getTime())) {
                sunriseStr = srDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
              } else if (rawSunrise.includes('T')) {
                sunriseStr = rawSunrise.split('T')[1].slice(0, 5);
              }
            }
            if (rawSunset) {
              const ssDate = new Date(rawSunset);
              if (!isNaN(ssDate.getTime())) {
                sunsetStr = ssDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
              } else if (rawSunset.includes('T')) {
                sunsetStr = rawSunset.split('T')[1].slice(0, 5);
              }
            }
          }

          if (wData && wData.current_weather) {
            setWeather({
              currentTemp: wData.current_weather.temperature,
              weatherCode: wData.current_weather.weathercode,
              windSpeed: wData.current_weather.windspeed,
              isDay: wData.current_weather.is_day === 1,
              locationName,
              dateTimeStr,
              sunriseStr,
              sunsetStr,
            });
          } else {
            setWeather({
              currentTemp: 22,
              weatherCode: 1,
              windSpeed: 8.5,
              isDay: true,
              locationName,
              dateTimeStr,
              sunriseStr,
              sunsetStr,
            });
          }
        }
      } catch {
        if (isMounted) {
          setWeather({
            currentTemp: 22,
            weatherCode: 1,
            windSpeed: 8.5,
            isDay: true,
            locationName: locationName || 'Destination',
            dateTimeStr: dateTimeStr || '',
          });
        }
      } finally {
        if (isMounted) setIsLoadingWeather(false);
      }
    };

    fetchWeatherForSelectedStop();
    return () => { isMounted = false; };
  }, [
    selectedWeatherStopId,
    trip?.id,
    trip?.title,
    (trip?.countries || []).join(','),
    (trip?.timeline || []).map(p => `${p.id}-${p.lat}-${p.lng}`).join(','),
  ]);

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      await generateTripPdf(trip);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const attractionsCount = (trip.timeline || []).filter(
    (p) => !p.isStay && !p.isTransportation && !p.isTransport && !p.isDailyHotelStop
  ).length;

  const totalExpenses = (trip.expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalChecklistCount = trip.checklist?.length || 0;
  const completedChecklistCount = (trip.checklist || []).filter((c) => c.checked).length;
  const currencySymbol = trip.baseCurrency || 'USD';

  const calculateDaysDuration = () => {
    if (!trip.startDate || !trip.endDate) return 'TBD';
    const start = new Date(trip.startDate);
    const end = new Date(trip.endDate);
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
    return `${diff} ${diff === 1 ? 'Day' : 'Days'}`;
  };

  const getPlansHighlights = () => {
    const todayObj = new Date();
    const todayStr = todayObj.toISOString().split('T')[0];

    const tomorrowObj = new Date(todayObj);
    tomorrowObj.setDate(tomorrowObj.getDate() + 1);
    const tomorrowStr = tomorrowObj.toISOString().split('T')[0];

    const startDate = trip.startDate || '';
    const endDate = trip.endDate || trip.startDate || '';
    const isTripStarted = startDate ? todayStr >= startDate : true;
    const isLastDayOrPast = isTripStarted && Boolean(endDate && todayStr >= endDate);
    const showUpcomingPlans = isTripStarted ? !isLastDayOrPast : true;

    const formatDateStr = (dStr: string) => {
      if (!dStr) return '';
      const dObj = new Date(dStr + 'T00:00:00');
      if (!isNaN(dObj.getTime())) {
        return dObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
      }
      return dStr;
    };

    const getPlacesForDate = (dateStr: string) => {
      return (trip.timeline || []).filter((place) => {
        if (!place.time) return false;
        const datePart = place.time.split('T')[0];
        return datePart === dateStr;
      });
    };

    const todaysPlaces = getPlacesForDate(todayStr);
    const tomorrowsPlaces = getPlacesForDate(tomorrowStr);

    const upcomingTargetDate = isTripStarted ? tomorrowStr : (startDate || todayStr);
    const upcomingPlaces = getPlacesForDate(upcomingTargetDate);

    return {
      todayStr,
      tomorrowStr,
      isTripStarted,
      isLastDayOrPast,
      showUpcomingPlans,
      todaysPlaces,
      tomorrowsPlaces,
      upcomingTargetDate,
      upcomingPlaces,
      formattedTodayDate: formatDateStr(todayStr),
      formattedTomorrowDate: formatDateStr(tomorrowStr),
      formattedUpcomingDate: formatDateStr(upcomingTargetDate),
    };
  };

  const {
    todayStr,
    tomorrowStr,
    isTripStarted,
    isLastDayOrPast,
    showUpcomingPlans,
    todaysPlaces,
    tomorrowsPlaces,
    upcomingTargetDate,
    upcomingPlaces,
    formattedTodayDate,
    formattedTomorrowDate,
    formattedUpcomingDate,
  } = getPlansHighlights();

  const completedStats = useMemo(() => {
    const stays = (trip.timeline || []).filter((p) => p.isStay);
    const transports = (trip.timeline || []).filter((p) => p.isTransportation || p.isTransport);
    const attractions = (trip.timeline || []).filter(
      (p) => !p.isStay && !p.isTransportation && !p.isTransport && !p.isDailyHotelStop
    );
    const totalStops = (trip.timeline || []).filter((p) => !p.isDailyHotelStop);

    const budgetLimit = trip.budgetLimit || 0;
    const isUnderBudget = budgetLimit > 0 ? totalExpenses <= budgetLimit : true;
    const budgetPct = budgetLimit > 0 ? Math.round((totalExpenses / budgetLimit) * 100) : 0;
    const remainingBudget = budgetLimit > 0 ? budgetLimit - totalExpenses : 0;

    let daysCount = 1;
    if (trip.startDate && trip.endDate) {
      const s = new Date(trip.startDate);
      const e = new Date(trip.endDate);
      daysCount = Math.max(1, Math.ceil((e.getTime() - s.getTime()) / (1000 * 3600 * 24)) + 1);
    }
    const avgDailyExpense = Math.round(totalExpenses / daysCount);

    const categoryTotals: { [cat: string]: number } = {};
    (trip.expenses || []).forEach((e) => {
      const cat = e.category || 'Other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (e.amount || 0);
    });
    const sortedCategories = Object.entries(categoryTotals)
      .map(([name, amount]) => ({
        name,
        amount,
        percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      staysCount: stays.length,
      transportsCount: transports.length,
      attractionsCount: attractions.length,
      totalStopsCount: totalStops.length,
      daysCount,
      avgDailyExpense,
      budgetLimit,
      isUnderBudget,
      budgetPct,
      remainingBudget,
      sortedCategories,
      allStops: totalStops,
    };
  }, [trip.timeline, trip.expenses, trip.startDate, trip.endDate, trip.budgetLimit, totalExpenses]);

  const getPlaceLocation = (p: Place) => {
    if (p.isTransportation) {
      if (p.fromLat && p.fromLng) return { lat: p.fromLat, lng: p.fromLng };
      if (p.toLat && p.toLng) return { lat: p.toLat, lng: p.toLng };
    }
    if (p.isStay) {
      if (p.stayLat && p.stayLng) return { lat: p.stayLat, lng: p.stayLng };
    }
    if (p.lat && p.lng) return { lat: p.lat, lng: p.lng };
    return null;
  };

  const formatStopClockTime = (timeStr?: string) => {
    if (!timeStr) return '--:--';
    if (timeStr.includes('T')) {
      const parts = timeStr.split('T')[1];
      if (parts && parts.length >= 5) {
        return parts.slice(0, 5);
      }
    }
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      return `${hours}:${mins}`;
    }
    return timeStr;
  };

  const isStopPassed = (timeStr?: string) => {
    if (!timeStr) return false;
    const now = new Date();
    if (timeStr.includes('T')) {
      const [dPart, tPart] = timeStr.split('T');
      const [year, month, day] = dPart.split('-').map(Number);
      const [hours, mins] = (tPart || '00:00').split(':').map(Number);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        const stopDate = new Date(year, month - 1, day, hours || 0, mins || 0);
        return now.getTime() >= stopDate.getTime();
      }
    }
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
      return now.getTime() >= d.getTime();
    }
    return false;
  };

  const handleOpenDirections = (place: Place, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const loc = getPlaceLocation(place);
    let destination = '';

    if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number' && (loc.lat !== 0 || loc.lng !== 0)) {
      destination = `${loc.lat},${loc.lng}`;
    } else if (place.address && place.address.trim()) {
      destination = place.address.trim();
    } else if (place.stayAddress && place.stayAddress.trim()) {
      destination = place.stayAddress.trim();
    } else if (place.toLocation && place.toLocation.trim()) {
      destination = place.toLocation.trim();
    } else if (place.to && place.to.trim()) {
      destination = place.to.trim();
    } else if (place.title && place.title.trim()) {
      destination = place.title.trim();
    }

    if (!destination) {
      destination = trip.countries?.[0] || trip.title || 'Directions';
    }

    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
    window.open(directionsUrl, '_blank', 'noopener,noreferrer');
  };

  const renderTimelineStopItem = (place: Place, idx: number, keyPrefix: string) => {
    const timeFormatted = formatStopClockTime(place.time);
    const isPassed = isStopPassed(place.time);
    const desc = place.description || place.transportDesc || place.address || place.stayAddress;

    return (
      <div
        key={`${keyPrefix}-${place.id || 'noid'}-${idx}`}
        onClick={(e) => handleOpenDirections(place, e)}
        className="flex items-start space-x-3 sm:space-x-4 p-2 -mx-2 rounded-2xl hover:bg-slate-100/80 dark:hover:bg-slate-800/60 transition cursor-pointer group"
        title="Tap stop to open directions in maps"
      >
        <div className="w-12 sm:w-14 text-right shrink-0 pt-0.5">
          <span className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 font-mono">
            {timeFormatted}
          </span>
        </div>

        <div className="pt-1 shrink-0">
          <div className={`w-3.5 h-3.5 rounded-full border-2 ${isPassed ? 'border-emerald-500' : 'border-rose-500'} bg-white dark:bg-slate-900 flex items-center justify-center z-10 shadow-xs group-hover:scale-110 transition-transform`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isPassed ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h5 className="font-extrabold text-slate-900 dark:text-white text-sm sm:text-base leading-tight truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              {place.title || 'Untitled Stop'}
            </h5>
            <span className="shrink-0 text-slate-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition flex items-center gap-1 text-xs font-semibold">
              <Navigation className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Directions</span>
            </span>
          </div>
          {desc && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
              {desc}
            </p>
          )}
        </div>
      </div>
    );
  };

  const currentWeatherDetails = weather ? getWeatherInfo(weather.weatherCode) : null;
  const WeatherIcon = currentWeatherDetails ? currentWeatherDetails.icon : Sun;

  const currentSelectedStopTitle = useMemo(() => {
    if (selectedWeatherStopId === 'destination') {
      return `Destination: ${trip.countries[0] || trip.title}`;
    }
    const found = (trip.timeline || []).find((s) => s.id === selectedWeatherStopId);
    return found ? found.title : `Destination: ${trip.countries[0] || trip.title}`;
  }, [selectedWeatherStopId, trip.timeline, trip.countries, trip.title]);

  const hasQuickActionButtons = isCompletedTrip || !isReadOnly;

  return (
    <div className="w-full space-y-6 text-left">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-20 right-6 z-[100] px-4 py-3 rounded-2xl bg-emerald-600 text-white font-bold text-xs shadow-2xl flex items-center space-x-2 animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="h-4 w-4" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Quick Actions Buttons */}
      {hasQuickActionButtons && (
        <div className="space-y-3">
          <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center space-x-2">
            <Zap className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>Quick Actions</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            {isCompletedTrip ? (
              <>
                <button
                  onClick={handleExportPdf}
                  disabled={isExportingPdf}
                  className="flex-1 flex items-center justify-center space-x-1.5 px-3.5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold transition shadow-sm cursor-pointer w-full text-center disabled:opacity-50"
                >
                  <Download className="h-4 w-4 shrink-0" />
                  <span className="truncate">{isExportingPdf ? 'Exporting...' : 'Export PDF'}</span>
                </button>

                {!isReadOnly && (
                  <button
                    onClick={handleOpenAddExpense}
                    className="flex-1 flex items-center justify-center space-x-1.5 px-3.5 py-2.5 rounded-2xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/60 text-xs sm:text-sm font-bold transition shadow-sm cursor-pointer w-full text-center"
                  >
                    <DollarSign className="h-4 w-4 shrink-0" />
                    <span className="truncate">Add Expense</span>
                  </button>
                )}
              </>
            ) : (
              <>
                {!isReadOnly && (
                  <button
                    onClick={handleOpenAddPlan}
                    className="flex-1 flex items-center justify-center space-x-1.5 px-3.5 py-2.5 rounded-2xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/60 text-xs sm:text-sm font-bold transition shadow-sm cursor-pointer w-full text-center"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span className="truncate">Add Plan</span>
                  </button>
                )}

                {!isReadOnly && (
                  <button
                    onClick={handleOpenAddExpense}
                    className="flex-1 flex items-center justify-center space-x-1.5 px-3.5 py-2.5 rounded-2xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/60 text-xs sm:text-sm font-bold transition shadow-sm cursor-pointer w-full text-center"
                  >
                    <DollarSign className="h-4 w-4 shrink-0" />
                    <span className="truncate">Add Expense</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {isCompletedTrip ? (
        /* COMPLETED TRIP VIEW */
        <div className="space-y-6 w-full">
          <div className="relative overflow-hidden rounded-3xl p-6 sm:p-7 bg-gradient-to-br from-indigo-900 via-slate-900 to-purple-950 text-white shadow-lg border border-indigo-800/40">
            <div className="absolute top-0 right-0 -mt-8 -mr-8 w-44 h-44 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="relative z-10 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-amber-300 shadow-inner">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">
                      Journey Completed
                    </span>
                    <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                      {trip.title} Recap
                    </h3>
                  </div>
                </div>

                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Completed Adventure</span>
                </span>
              </div>

              <p className="text-xs sm:text-sm text-slate-300 max-w-2xl font-medium">
                Here is your comprehensive post-trip summary, exploration milestones, financial overview, and highlight memories for this completed trip.
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <div className="px-3 py-1.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 text-slate-200 flex items-center gap-2 font-bold">
                  <Calendar className="h-3.5 w-3.5 text-indigo-300" />
                  <span>{calculateDaysDuration()} ({trip.startDate || 'N/A'} – {trip.endDate || 'N/A'})</span>
                </div>

                {trip.countries && trip.countries.length > 0 && (
                  <div className="px-3 py-1.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 text-slate-200 flex items-center gap-2 font-bold">
                    <MapPin className="h-3.5 w-3.5 text-emerald-300" />
                    <span>{trip.countries.join(', ')}</span>
                  </div>
                )}

                <div className="px-3 py-1.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 text-slate-200 flex items-center gap-2 font-bold">
                  <Users className="h-3.5 w-3.5 text-purple-300" />
                  <span>{trip.travelers?.length || 1} {trip.travelers?.length === 1 ? 'Traveler' : 'Travelers'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Compass className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sightseeing</span>
              </div>
              <div>
                <h4 className="text-2xl font-black text-slate-900 dark:text-white">
                  {completedStats.attractionsCount}
                </h4>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                  Attractions Explored
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {completedStats.staysCount} Stays • {completedStats.transportsCount} Transit routes
                </p>
              </div>
              {onOpenMap && (
                <button
                  onClick={() => onOpenMap?.()}
                  className="pt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Explore Route Map</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <DollarSign className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Spent</span>
              </div>
              <div>
                <h4 className="text-2xl font-black text-slate-900 dark:text-white">
                  {currencySymbol} {totalExpenses.toLocaleString()}
                </h4>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                  Avg ~{currencySymbol} {completedStats.avgDailyExpense.toLocaleString()} / day
                </p>
                {completedStats.budgetLimit > 0 ? (
                  <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    completedStats.isUnderBudget
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60'
                  }`}>
                    {completedStats.isUnderBudget ? 'Under Budget' : 'Over Budget'} ({completedStats.budgetPct}%)
                  </span>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">{(trip.expenses || []).length} expenses logged</p>
                )}
              </div>
              {onSwitchToTab && (
                <button
                  onClick={() => onSwitchToTab('expenses')}
                  className="pt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>View All Expenses</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <CheckSquare className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Preparation</span>
              </div>
              <div>
                <h4 className="text-2xl font-black text-slate-900 dark:text-white">
                  {totalChecklistCount > 0 ? `${Math.round((completedChecklistCount / totalChecklistCount) * 100)}%` : '100%'}
                </h4>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                  Checklist Completion
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {completedChecklistCount} of {totalChecklistCount} tasks completed
                </p>
              </div>
              {onSwitchToTab && (
                <button
                  onClick={() => onSwitchToTab('checklist')}
                  className="pt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Review Checklist</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Users className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Travelers</span>
              </div>
              <div>
                <h4 className="text-2xl font-black text-slate-900 dark:text-white">
                  {trip.travelers?.length || 1}
                </h4>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                  {trip.travelers && trip.travelers.length > 1 ? 'Group Members' : 'Solo Traveler'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                  {trip.travelers && trip.travelers.length > 0 ? trip.travelers.join(', ') : 'Independent explorer'}
                </p>
              </div>
              <div className="pt-2 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                Trip memories recorded
              </div>
            </div>
          </div>

          {completedStats.sortedCategories.length > 0 && (
            <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800">
                <div className="flex items-center space-x-2">
                  <PieChart className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="font-black text-slate-900 dark:text-white text-base sm:text-lg">
                    Expense Breakdown by Category
                  </h3>
                </div>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Total: {currencySymbol} {totalExpenses.toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {completedStats.sortedCategories.map((cat, idx) => (
                  <div key={`cat-recap-${cat.name}-${idx}`} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-800 dark:text-slate-200">{cat.name}</span>
                      <span className="text-slate-900 dark:text-white font-extrabold">{currencySymbol} {cat.amount.toLocaleString()} ({cat.percentage}%)</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(4, cat.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6">
            <AdBanner type="sidebar" onOpenUpgradeModal={onOpenUpgradeModal} />
          </div>
        </div>
      ) : (
        /* ONGOING & UPCOMING TRIPS */
        <>
          <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3.5 w-full">
            <div className="flex items-center space-x-3 text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-200">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Calendar className="h-4 w-4" />
              </div>
              <span>{calculateDaysDuration()} trip</span>
            </div>

            <div className="flex items-center space-x-3 text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-200">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <MapPin className="h-4 w-4" />
              </div>
              <span>{attractionsCount} attractions</span>
            </div>

            <div className="flex items-center space-x-3 text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-200">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <DollarSign className="h-4 w-4" />
              </div>
              <span>{currencySymbol} {totalExpenses.toLocaleString()} spent</span>
            </div>
          </div>

          <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800 max-w-full overflow-hidden">
              <div className="flex items-center space-x-2.5 shrink-0">
                <div className="h-9 w-9 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold shrink-0">
                  <Sun className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                    Weather
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Check weather condition for any stop
                  </p>
                </div>
              </div>

              {/* Stop Selector Bottom Sheet Trigger Button */}
              <div className="flex flex-wrap items-center gap-2 max-w-full">
                <button
                  type="button"
                  onClick={() => setShowWeatherBottomSheet(true)}
                  className="w-full sm:w-auto max-w-full flex items-center justify-between gap-2 px-3.5 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold hover:bg-slate-200/70 dark:hover:bg-slate-750 transition cursor-pointer"
                >
                  <span className="truncate flex items-center gap-1.5">
                    <span>📍</span>
                    <span className="truncate">{currentSelectedStopTitle}</span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </button>
              </div>
            </div>

            {isLoadingWeather ? (
              <div className="py-4 text-center space-y-2">
                <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                <p className="text-xs text-slate-500 dark:text-slate-400">Fetching weather data...</p>
              </div>
            ) : weatherError ? (
              <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>{weatherError}</span>
              </div>
            ) : weather ? (
              <div className="flex flex-col sm:flex-row sm:items-start gap-4 max-w-full overflow-hidden">
                <div className="flex items-start space-x-3.5 min-w-0 w-full">
                  <div className={`p-2.5 rounded-2xl ${currentWeatherDetails?.bg} ${currentWeatherDetails?.color} shrink-0 mt-0.5`}>
                    <WeatherIcon className="h-7 w-7" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-baseline space-x-2">
                      <span className="text-2xl font-black text-slate-900 dark:text-white">
                        {formatTemp(weather.currentTemp)}
                      </span>
                      <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                        {currentWeatherDetails?.label}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2">
                      <div>
                        Location: <strong className="text-slate-800 dark:text-slate-100 font-bold">{weather.locationName}</strong>
                      </div>

                      {weather.dateTimeStr && (
                        <div className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center space-x-1.5">
                          <span className="text-emerald-500 font-extrabold">•</span>
                          <span>{weather.dateTimeStr}</span>
                        </div>
                      )}

                      <div className="flex items-center space-x-1.5 text-slate-700 dark:text-slate-300 font-semibold">
                        <Wind className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span>Wind: {Math.round(weather.windSpeed)} km/h</span>
                      </div>

                      {weather.sunriseStr && (
                        <div className="flex items-center space-x-1.5 text-amber-600 dark:text-amber-400 font-bold">
                          <Sunrise className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span>Sunrise: {weather.sunriseStr}</span>
                        </div>
                      )}

                      {weather.sunsetStr && (
                        <div className="flex items-center space-x-1.5 text-orange-600 dark:text-orange-400 font-bold">
                          <Sunset className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                          <span>Sunset: {weather.sunsetStr}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Weather Stop Modal Bottom Sheet */}
          <WeatherStopBottomSheet
            isOpen={showWeatherBottomSheet}
            onClose={() => setShowWeatherBottomSheet(false)}
            timeline={trip.timeline || []}
            destinationName={trip.countries[0] || trip.title}
            selectedStopId={selectedWeatherStopId}
            onSelectStop={(stopId) => setSelectedWeatherStopId(stopId)}
          />

          <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-5 w-full text-left">
            <div className="pb-3 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-black text-slate-900 dark:text-white text-lg">
                  Plans
                </h3>
              </div>
              {!isReadOnly && (
                <button
                  onClick={handleOpenAddPlan}
                  className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-900/60 rounded-xl text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Plan</span>
                </button>
              )}
            </div>

            <div className="space-y-6">
              {isTripStarted ? (
                <>
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-extrabold text-slate-900 dark:text-white text-base sm:text-lg">
                        Today's Plans
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        {formattedTodayDate}
                      </p>
                    </div>

                    {todaysPlaces.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500 italic py-1">
                        No stops scheduled for today ({formattedTodayDate}).
                      </p>
                    ) : (
                      <div className="space-y-2 pt-1">
                        {todaysPlaces.map((place, idx) => renderTimelineStopItem(place, idx, 'today-place'))}
                      </div>
                    )}
                  </div>

                  {showUpcomingPlans && (
                    <>
                      <div className="border-t border-slate-200/80 dark:border-slate-800 my-4" />

                      <div className="space-y-3">
                        <div>
                          <h4 className="font-extrabold text-slate-900 dark:text-white text-base sm:text-lg">
                            Upcoming Plans
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            {formattedTomorrowDate}
                          </p>
                        </div>

                        {tomorrowsPlaces.length === 0 ? (
                          <p className="text-xs text-slate-400 dark:text-slate-500 italic py-1">
                            No stops scheduled for tomorrow ({formattedTomorrowDate}).
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            {tomorrowsPlaces.map((place, idx) => renderTimelineStopItem(place, idx, 'tomorrow-place'))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <div>
                    <h4 className="font-extrabold text-slate-900 dark:text-white text-base sm:text-lg">
                      Upcoming Plans
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      {formattedUpcomingDate}
                    </p>
                  </div>

                  {upcomingPlaces.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500 italic py-1">
                      No stops scheduled for Day 1 ({formattedUpcomingDate}).
                    </p>
                  ) : (
                    <div className="space-y-2 pt-1">
                      {upcomingPlaces.map((place, idx) => renderTimelineStopItem(place, idx, 'upcoming-place'))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6">
              <AdBanner type="sidebar" onOpenUpgradeModal={onOpenUpgradeModal} />
            </div>
          </div>
        </>
      )}

      {/* Shared Reusable Add Plan Modal */}
      {!isReadOnly && (
        <AddPlanModal
          isOpen={showAddPlanModal}
          onClose={() => setShowAddPlanModal(false)}
          activeTrip={trip}
          onSavePlan={(placesToAdd) => {
            let newTimeline = [...(trip.timeline || [])];
            newTimeline.push(...placesToAdd);
            newTimeline.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
            let updatedTrip: Trip = { ...trip, timeline: newTimeline, updatedAt: new Date().toISOString() };
            if (updatedTrip.enableHotelDailyStops) {
              updatedTrip = reconcileDailyHotelStops(updatedTrip);
            }
            const updatedTripsMap: { [id: string]: Trip } = Array.isArray(trips)
              ? trips.reduce((acc, t) => ({ ...acc, [t.id]: t.id === trip.id ? updatedTrip : t }), {})
              : { ...trips, [trip.id]: updatedTrip };
            onUpdateTrips(updatedTripsMap);
          }}
        />
      )}

      {/* Shared Reusable Add Expense Modal */}
      {!isReadOnly && (
        <AddExpenseModal
          isOpen={showAddExpenseModal}
          onClose={() => setShowAddExpenseModal(false)}
          activeTrip={trip}
          onSaveExpense={(newExpense) => {
            const updatedExpenses = [...(trip.expenses || []), newExpense];
            const updatedTrip = { ...trip, expenses: updatedExpenses, updatedAt: new Date().toISOString() };
            const updatedTripsMap: { [id: string]: Trip } = Array.isArray(trips)
              ? trips.reduce((acc, t) => ({ ...acc, [t.id]: t.id === trip.id ? updatedTrip : t }), {})
              : { ...trips, [trip.id]: updatedTrip };
            onUpdateTrips(updatedTripsMap);
          }}
        />
      )}
    </div>
  );
}
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Sun, CloudSun, CloudRain, Snowflake, Zap, Thermometer, Compass, MapPin, 
  Calendar, Sparkles, Clock, ArrowRight, Navigation, DollarSign, CheckSquare, 
  Layers, Wind, Droplets, Map, Download, ChevronRight, FileText, CheckCircle2,
  AlertCircle, Building2, Plane, Car, Train, Bus, Plus, X, Check, Utensils,
  Tag, CreditCard, Coins, AlertTriangle, Upload, Search, Sunrise, Sunset,
  Trophy, Award, Luggage, Star, Receipt, PieChart, Users
} from 'lucide-react';
import { Trip, Place, Expense } from '../types';
import { compressImageFile } from '../lib/imageUtils';
import { generateTripPdf } from '../lib/pdfGenerator';
import { AddPlanModal } from './AddPlanModal';
import { AddExpenseModal } from './AddExpenseModal';
import { reconcileDailyHotelStops } from '../lib/hotelStopsUtils';
import { getTripCategory } from '../lib/tripUtils';
import AdBanner from './AdBanner';
import { useBackButton } from '../lib/backButtonHandler';
import { searchLocationsOnline, reverseGeocodeOnline, fetchWeatherOnline } from '../lib/apiUtils';

declare const L: any;

interface ModalPickerMapProps {
  pickerSelectedLat: number;
  pickerSelectedLng: number;
  setPickerSelectedLat: (lat: number) => void;
  setPickerSelectedLng: (lng: number) => void;
  setPickerSelectedAddress: (address: string) => void;
  setIsPickerGeocoding: (geocoding: boolean) => void;
  flyToTrigger: { lat: number; lng: number; time: number } | null;
}

const ModalPickerMap = ({
  pickerSelectedLat,
  pickerSelectedLng,
  setPickerSelectedLat,
  setPickerSelectedLng,
  setPickerSelectedAddress,
  setIsPickerGeocoding,
  flyToTrigger,
}: ModalPickerMapProps) => {
  const modalMapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!modalMapRef.current) return;

    let isInitialMapLoad = true;
    const container = modalMapRef.current;
    if ((container as any)._leaflet_map) {
      try {
        (container as any)._leaflet_map.remove();
      } catch (e) {
        console.warn('Error removing existing map:', e);
      }
      (container as any)._leaflet_map = null;
    }
    (container as any)._leaflet_id = null;

    const map = L.map(container, {
      center: [pickerSelectedLat, pickerSelectedLng],
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
    });
    (container as any)._leaflet_map = map;
    mapInstanceRef.current = map;

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const isDark = document.documentElement.classList.contains('dark');
    const tileUrl = isDark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

    L.tileLayer(tileUrl, { maxZoom: 20 }).addTo(map);

    let debounceTimer: any = null;

    map.on('moveend', () => {
      if (isInitialMapLoad) {
        isInitialMapLoad = false;
        return;
      }
      const center = map.getCenter();
      const lat = Number(center.lat.toFixed(6));
      const lng = Number(center.lng.toFixed(6));

      setPickerSelectedLat(lat);
      setPickerSelectedLng(lng);

      if (debounceTimer) clearTimeout(debounceTimer);

      setIsPickerGeocoding(true);
      debounceTimer = setTimeout(async () => {
        try {
          const address = await reverseGeocodeOnline(lat, lng);
          setPickerSelectedAddress(address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        } catch (e) {
          setPickerSelectedAddress(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        } finally {
          setIsPickerGeocoding(false);
        }
      }, 600);
    });

    const timer = setTimeout(() => {
      if (map && (map as any)._container) {
        map.invalidateSize();
      }
    }, 250);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      clearTimeout(timer);
      map.off();
      map.stop();
      map.remove();
      if (container) delete (container as any)._leaflet_map;
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (flyToTrigger && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([flyToTrigger.lat, flyToTrigger.lng], 16, { animate: true, duration: 0.35 });
    }
  }, [flyToTrigger]);

  return (
    <div className="relative h-full w-full">
      <div ref={modalMapRef} className="h-full w-full z-10" />
    </div>
  );
};

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

// Helper function to pick default weather stop based on date and time
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
    // If before trip start date, by default select the upcoming stop weather
    const upcoming = stopsWithTime.find((item) => item.stopDate > now) || stopsWithTime[0];
    return upcoming.stop.id;
  }

  // Current stop based on date and time
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

  // Selected stop for weather - default to current or upcoming stop based on date & time
  const [selectedWeatherStopId, setSelectedWeatherStopId] = useState<string>(
    () => getDefaultWeatherStopId(trip)
  );

  useEffect(() => {
    setSelectedWeatherStopId(getDefaultWeatherStopId(trip));
  }, [trip.id]);

  // Quick Action Modals State
  const [showAddPlanModal, setShowAddPlanModal] = useState(false);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);

  // Add Plan Form State (matching Planner.tsx)
  const [planTab, setPlanTab] = useState<'plan' | 'transport' | 'stay'>('plan');
  const [planTitle, setPlanTitle] = useState('');
  const [planDate, setPlanDate] = useState('');
  const [planTime, setPlanTime] = useState('10:00');
  const [planAddress, setPlanAddress] = useState('');
  const [planDesc, setPlanDesc] = useState('');
  // Transport fields
  const [transportType, setTransportType] = useState<'Flight' | 'Train' | 'Bus' | 'Ferry' | 'Car' | 'Other'>('Flight');
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [bookingRef, setBookingRef] = useState('');
  // Stay fields
  const [hotelName, setHotelName] = useState('');
  const [hotelAddress, setHotelAddress] = useState('');
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [confirmationNum, setConfirmationNum] = useState('');
  // Attachments
  const [stopAttachmentName, setStopAttachmentName] = useState('');
  const [stopAttachmentData, setStopAttachmentData] = useState('');
  const [planValidationError, setPlanValidationError] = useState<string | null>(null);

  // Map Picker State
  const [activeMapPickerTarget, setActiveMapPickerTarget] = useState<'stop' | 'from' | 'to' | 'stay' | null>(null);
  const [pickerSelectedLat, setPickerSelectedLat] = useState(48.8566);
  const [pickerSelectedLng, setPickerSelectedLng] = useState(2.3522);
  const [pickerSelectedAddress, setPickerSelectedAddress] = useState('');
  const [pickerSearchQuery, setPickerSearchQuery] = useState('');
  const [pickerSuggestions, setPickerSuggestions] = useState<any[]>([]);
  const [isPickerGeocoding, setIsPickerGeocoding] = useState(false);
  const [flyToTrigger, setFlyToTrigger] = useState<{ lat: number; lng: number; time: number } | null>(null);
  const pickerSearchTimeoutRef = useRef<any>(null);

  // Address lat/lng state
  const [planLat, setPlanLat] = useState<number>(0);
  const [planLng, setPlanLng] = useState<number>(0);
  const [fromLat, setFromLat] = useState<number>(0);
  const [fromLng, setFromLng] = useState<number>(0);
  const [toLat, setToLat] = useState<number>(0);
  const [toLng, setToLng] = useState<number>(0);
  const [hotelLat, setHotelLat] = useState<number>(0);
  const [hotelLng, setHotelLng] = useState<number>(0);

  const handleOpenMapPicker = (target: 'stop' | 'from' | 'to' | 'stay') => {
    let initialLat = 48.8566;
    let initialLng = 2.3522;
    let initialAddress = '';

    if (target === 'stop') {
      initialLat = planLat || 48.8566;
      initialLng = planLng || 2.3522;
      initialAddress = planAddress || '';
    } else if (target === 'from') {
      initialLat = fromLat || 48.8566;
      initialLng = fromLng || 2.3522;
      initialAddress = fromLocation || '';
    } else if (target === 'to') {
      initialLat = toLat || 48.8566;
      initialLng = toLng || 2.3522;
      initialAddress = toLocation || '';
    } else if (target === 'stay') {
      initialLat = hotelLat || 48.8566;
      initialLng = hotelLng || 2.3522;
      initialAddress = hotelAddress || '';
    }

    if (initialLat === 48.8566 && trip.timeline?.length) {
      const itemWithCoords = trip.timeline.find((item) => item.lat && item.lng);
      if (itemWithCoords) {
        initialLat = itemWithCoords.lat;
        initialLng = itemWithCoords.lng;
      }
    }

    setPickerSelectedLat(initialLat);
    setPickerSelectedLng(initialLng);
    setPickerSelectedAddress(initialAddress);
    setPickerSearchQuery('');
    setPickerSuggestions([]);
    setActiveMapPickerTarget(target);
  };

  const handlePickerSearch = (query: string) => {
    setPickerSearchQuery(query);
    if (query.trim().length < 2) {
      setPickerSuggestions([]);
      return;
    }
    if (pickerSearchTimeoutRef.current) clearTimeout(pickerSearchTimeoutRef.current);

    pickerSearchTimeoutRef.current = setTimeout(async () => {
      try {
        const data = await searchLocationsOnline(query, 5);
        setPickerSuggestions(data);
      } catch (err) {
        console.error(err);
      }
    }, 400);
  };

  const handleConfirmPickerSelection = () => {
    if (!activeMapPickerTarget) return;

    if (activeMapPickerTarget === 'stop') {
      setPlanLat(pickerSelectedLat);
      setPlanLng(pickerSelectedLng);
      setPlanAddress(pickerSelectedAddress || `${pickerSelectedLat.toFixed(4)}, ${pickerSelectedLng.toFixed(4)}`);
    } else if (activeMapPickerTarget === 'from') {
      setFromLat(pickerSelectedLat);
      setFromLng(pickerSelectedLng);
      setFromLocation(pickerSelectedAddress || `${pickerSelectedLat.toFixed(4)}, ${pickerSelectedLng.toFixed(4)}`);
    } else if (activeMapPickerTarget === 'to') {
      setToLat(pickerSelectedLat);
      setToLng(pickerSelectedLng);
      setToLocation(pickerSelectedAddress || `${pickerSelectedLat.toFixed(4)}, ${pickerSelectedLng.toFixed(4)}`);
    } else if (activeMapPickerTarget === 'stay') {
      setHotelLat(pickerSelectedLat);
      setHotelLng(pickerSelectedLng);
      setHotelAddress(pickerSelectedAddress || `${pickerSelectedLat.toFixed(4)}, ${pickerSelectedLng.toFixed(4)}`);
    }

    setActiveMapPickerTarget(null);
  };

  // Add Expense Form State (matching ExpenseTracker.tsx)
  const [expTitle, setExpTitle] = useState('');
  const [expSpendAmount, setExpSpendAmount] = useState('');
  const [expSpendCurrency, setExpSpendCurrency] = useState(trip.baseCurrency || 'USD');
  const [expExchangeRate, setExpExchangeRate] = useState('1.0');
  const [expCategory, setExpCategory] = useState('Food');
  const [expDate, setExpDate] = useState('');
  const [expPaidBy, setExpPaidBy] = useState('');

  // File upload handler
  const handleStopFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file);
      setStopAttachmentName(compressed.name);
      setStopAttachmentData(compressed.data);
    } catch (err) {
      console.error('Error compressing stop file:', err);
    }
  };

  // Add To-Do Form State
  const [showAddTodoModal, setShowAddTodoModal] = useState(false);
  const [todoTask, setTodoTask] = useState('');
  const [todoCategory, setTodoCategory] = useState('General');

  // Sub-overlays & modals back button handlers
  useBackButton('summary-add-todo', showAddTodoModal, () => setShowAddTodoModal(false), 110);
  useBackButton('summary-map-picker', activeMapPickerTarget !== null, () => setActiveMapPickerTarget(null), 110);

  // Toast / Banner feedback
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  // Open Add To-Do Modal
  const handleOpenAddTodo = () => {
    setTodoTask('');
    setTodoCategory('General');
    setShowAddTodoModal(true);
  };

  // Submit Add To-Do
  const handleSubmitAddTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!todoTask.trim()) return;

    const newTodo = {
      id: 'check-' + Date.now(),
      task: todoTask.trim(),
      checked: false,
      category: todoCategory.trim() || 'General',
    };

    const updatedChecklist = [...(trip.checklist || []), newTodo];
    const updatedTrip = { ...trip, checklist: updatedChecklist, updatedAt: new Date().toISOString() };
    const updatedTripsMap: { [id: string]: Trip } = Array.isArray(trips)
      ? trips.reduce((acc, t) => ({ ...acc, [t.id]: t.id === trip.id ? updatedTrip : t }), {})
      : { ...trips, [trip.id]: updatedTrip };

    onUpdateTrips(updatedTripsMap);
    setShowAddTodoModal(false);
    showToast('✅ Checklist item added!');
  };

  const getCalculatedAddPlanDate = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (!trip.startDate) return todayStr;
    if (todayStr < trip.startDate) return trip.startDate;
    if (trip.endDate && todayStr > trip.endDate) return trip.startDate;
    return todayStr;
  };

  const getCalculatedExpenseDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  // Open Add Plan Modal with correctly prefilled & restricted date
  const handleOpenAddPlan = () => {
    const defaultDate = getCalculatedAddPlanDate();
    setPlanTab('plan');
    setPlanTitle('');
    setPlanDate(defaultDate);
    setPlanTime('10:00');
    setPlanAddress('');
    setPlanDesc('');
    setPlanLat(0);
    setPlanLng(0);
    setTransportType('Flight');
    setFromLocation('');
    setToLocation('');
    setFromLat(0);
    setFromLng(0);
    setToLat(0);
    setToLng(0);
    setDepartureTime(`${defaultDate}T09:00`);
    setArrivalTime(`${defaultDate}T12:00`);
    setBookingRef('');
    setHotelName('');
    setHotelAddress('');
    setHotelLat(0);
    setHotelLng(0);
    setCheckInTime(`${defaultDate}T14:00`);
    setCheckOutTime(`${defaultDate}T11:00`);
    setConfirmationNum('');
    setStopAttachmentName('');
    setStopAttachmentData('');
    setShowAddPlanModal(true);
  };

  // Open Add Expense Modal with current date prefilled
  const handleOpenAddExpense = () => {
    setExpTitle('');
    setExpSpendAmount('');
    setExpSpendCurrency(trip.baseCurrency || 'USD');
    setExpExchangeRate('1.0');
    const categories = trip.categories?.length ? trip.categories : ['Food', 'Transport', 'Lodging', 'Activities', 'Shopping', 'Other'];
    setExpCategory(categories[0] || 'Food');
    setExpDate(getCalculatedExpenseDate());
    const travelers = trip.travelers?.length ? trip.travelers : ['Me'];
    setExpPaidBy(travelers[0] || 'Me');
    setShowAddExpenseModal(true);
  };

  // Submit Add Plan
  const handleSubmitAddPlan = (e: React.FormEvent) => {
    e.preventDefault();
    setPlanValidationError(null);
    let newPlace: Place;

    if (planTab === 'plan') {
      if (!planTitle.trim()) return;
      const formattedTime = `${planDate}T${planTime}`;
      newPlace = {
        id: 'place-' + Date.now(),
        title: planTitle.trim(),
        time: formattedTime,
        address: planAddress.trim(),
        description: planDesc.trim(),
        attachmentName: stopAttachmentName || undefined,
        attachmentData: stopAttachmentData || undefined,
        lat: planLat || 0,
        lng: planLng || 0,
      };
    } else if (planTab === 'transport') {
      if (!fromLocation.trim() || !toLocation.trim()) return;
      const effectiveDepartureTime = departureTime || `${planDate}T09:00`;
      if (effectiveDepartureTime && arrivalTime) {
        const depT = new Date(effectiveDepartureTime).getTime();
        const arrT = new Date(arrivalTime).getTime();
        if (!isNaN(depT) && !isNaN(arrT) && arrT <= depT) {
          setPlanValidationError('Arrival time must be after departure time.');
          return;
        }
      }

      newPlace = {
        id: 'place-' + Date.now(),
        title: `${transportType}: ${fromLocation.trim()} → ${toLocation.trim()}`,
        description: `Transportation from ${fromLocation.trim()} to ${toLocation.trim()}`,
        address: fromLocation.trim(),
        time: effectiveDepartureTime,
        arrivalTime: arrivalTime || `${planDate}T12:00`,
        fromLocation: fromLocation.trim(),
        toLocation: toLocation.trim(),
        transportType,
        bookingRef: bookingRef.trim(),
        isTransportation: true,
        isTransport: true,
        attachmentName: stopAttachmentName || undefined,
        attachmentData: stopAttachmentData || undefined,
        lat: fromLat || 0,
        lng: fromLng || 0,
      };
    } else {
      // stay
      if (!hotelName.trim()) return;
      const effectiveCheckIn = checkInTime || `${planDate}T14:00`;
      if (effectiveCheckIn && checkOutTime) {
        const inT = new Date(effectiveCheckIn).getTime();
        const outT = new Date(checkOutTime).getTime();
        if (!isNaN(inT) && !isNaN(outT) && outT <= inT) {
          setPlanValidationError('Check-out time must be after check-in time.');
          return;
        }
      }

      newPlace = {
        id: 'place-' + Date.now(),
        title: hotelName.trim(),
        description: hotelAddress.trim() || 'Stay / Accommodation',
        time: effectiveCheckIn,
        checkOutTime: checkOutTime || `${planDate}T11:00`,
        address: hotelAddress.trim(),
        confirmationNum: confirmationNum.trim(),
        isStay: true,
        attachmentName: stopAttachmentName || undefined,
        attachmentData: stopAttachmentData || undefined,
        lat: hotelLat || 0,
        lng: hotelLng || 0,
      };
    }

    const updatedTimeline = [...(trip.timeline || []), newPlace];
    let updatedTrip: Trip = { ...trip, timeline: updatedTimeline, updatedAt: new Date().toISOString() };
    if (updatedTrip.enableHotelDailyStops) {
      updatedTrip = reconcileDailyHotelStops(updatedTrip);
    }
    const updatedTripsMap: { [id: string]: Trip } = Array.isArray(trips)
      ? trips.reduce((acc, t) => ({ ...acc, [t.id]: t.id === trip.id ? updatedTrip : t }), {})
      : { ...trips, [trip.id]: updatedTrip };

    onUpdateTrips(updatedTripsMap);
    setShowAddPlanModal(false);
    showToast('✨ Plan added to itinerary successfully!');
  };

  // Submit Add Expense
  const handleSubmitAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expTitle.trim() || !expSpendAmount) return;

    const parsedSpend = parseFloat(expSpendAmount) || 0;
    const parsedRate = parseFloat(expExchangeRate) || 1.0;
    const totalAmount = parsedSpend * parsedRate;

    const newExpense: Expense = {
      id: 'exp-' + Date.now(),
      title: expTitle.trim(),
      amount: totalAmount,
      category: expCategory,
      date: expDate || getCalculatedExpenseDate(),
      paidBy: expPaidBy.trim() || (trip.travelers?.[0] || 'Me'),
      splitType: 'equal',
      splits: [],
      placeId: null,
      spendAmount: parsedSpend,
      spendCurrency: expSpendCurrency || trip.baseCurrency || 'USD',
    };

    const updatedExpenses = [...(trip.expenses || []), newExpense];
    const updatedTrip = { ...trip, expenses: updatedExpenses, updatedAt: new Date().toISOString() };
    const updatedTripsMap: { [id: string]: Trip } = Array.isArray(trips)
      ? trips.reduce((acc, t) => ({ ...acc, [t.id]: t.id === trip.id ? updatedTrip : t }), {})
      : { ...trips, [trip.id]: updatedTrip };

    onUpdateTrips(updatedTripsMap);
    setShowAddExpenseModal(false);
    showToast('💰 Expense logged successfully!');
  };

  // Convert Celsius to Fahrenheit helper
  const formatTemp = (celsius: number) => {
    if (tempUnit === 'F') {
      return `${Math.round((celsius * 9) / 5 + 32)}°F`;
    }
    return `${Math.round(celsius)}°C`;
  };

  // Weather Code WMO interpreter
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

  // Trip Category & Timing State
  const tripCategory = getTripCategory(trip);
  const isCompletedTrip = tripCategory === 'completed';

  // Requirement 4: User should be able to get weather for each stop in timeline for the entered date and time in a single card
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

        // Fallback to trip destination coordinates
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

        // Fetch Weather via direct Open-Meteo or backend proxy
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

  // PDF Export handler
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

  // Requirement 5: Exclude hotel stay from total stops. Rename total stop to Attractions.
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

  // Requirement 6: Plans calculation
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

  // Analytics for completed trip view
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

    // Categories
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

  const calcDistanceBetweenPlaces = (p1: Place, p2: Place) => {
    const loc1 = getPlaceLocation(p1);
    const loc2 = getPlaceLocation(p2);
    if (!loc1 || !loc2) return null;

    const R = 6371000;
    const dLat = ((loc2.lat - loc1.lat) * Math.PI) / 180;
    const dLon = ((loc2.lng - loc1.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((loc1.lat * Math.PI) / 180) *
        Math.cos((loc2.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const meters = R * c;

    if (meters <= 5) return null;
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(2)} km`;
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
        {/* Time */}
        <div className="w-12 sm:w-14 text-right shrink-0 pt-0.5">
          <span className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 font-mono">
            {timeFormatted}
          </span>
        </div>

        {/* Bullet */}
        <div className="pt-1 shrink-0">
          <div className={`w-3.5 h-3.5 rounded-full border-2 ${isPassed ? 'border-emerald-500' : 'border-rose-500'} bg-white dark:bg-slate-900 flex items-center justify-center z-10 shadow-xs group-hover:scale-110 transition-transform`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isPassed ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          </div>
        </div>

        {/* Place Details (Title, Description & Directions button) */}
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

              <button
                onClick={handleOpenAddExpense}
                className="flex-1 flex items-center justify-center space-x-1.5 px-3.5 py-2.5 rounded-2xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/60 text-xs sm:text-sm font-bold transition shadow-sm cursor-pointer w-full text-center"
              >
                <DollarSign className="h-4 w-4 shrink-0" />
                <span className="truncate">Add Expense</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleOpenAddPlan}
                className="flex-1 flex items-center justify-center space-x-1.5 px-3.5 py-2.5 rounded-2xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/60 text-xs sm:text-sm font-bold transition shadow-sm cursor-pointer w-full text-center"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="truncate">Add Plan</span>
              </button>

              <button
                onClick={handleOpenAddExpense}
                className="flex-1 flex items-center justify-center space-x-1.5 px-3.5 py-2.5 rounded-2xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/60 text-xs sm:text-sm font-bold transition shadow-sm cursor-pointer w-full text-center"
              >
                <DollarSign className="h-4 w-4 shrink-0" />
                <span className="truncate">Add Expense</span>
              </button>
            </>
          )}
        </div>
      </div>

      {isCompletedTrip ? (
        /* ========================================================================= */
        /* COMPLETED TRIP: Informative Recap, Analytics, Spending & Highlights Showcase */
        /* ========================================================================= */
        <div className="space-y-6 w-full">
          {/* 1. Journey Celebration Hero Banner */}
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

              {/* Quick Trip Metadata Badges */}
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

          {/* 2. Key Intelligence & Analytics Bento Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Exploration Card */}
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
                  onClick={onOpenMap}
                  className="pt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Explore Route Map</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Financial Card */}
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

            {/* Checklist Accomplishment */}
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

            {/* Companions & Group */}
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

          {/* 3. Spending Category Breakdown (if expenses exist) */}
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

          {/* Sponsored Banner Ad in Summary */}
          <div className="mt-6">
            <AdBanner type="sidebar" onOpenUpgradeModal={onOpenUpgradeModal} />
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* ONGOING & UPCOMING TRIPS: Standard Weather Widget + Today/Upcoming Plans */
        /* ========================================================================= */
        <>
          {/* Key Metrics: Compact single section showing 3 text rows with logos */}
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

          {/* Weather Widget Card */}
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

              <div className="flex flex-wrap items-center gap-2 max-w-full">
                {/* Stop Selector Dropdown */}
                <select
                  value={selectedWeatherStopId}
                  onChange={(e) => setSelectedWeatherStopId(e.target.value)}
                  className="w-full sm:w-auto max-w-full truncate mx-0.5 px-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="destination">📍 Destination: {trip.countries[0] || trip.title}</option>
                  {(trip.timeline || []).map((stop, idx) => (
                    <option key={`stop-opt-${stop.id || 'noid'}-${idx}`} value={stop.id}>
                      Stop #{idx + 1}: {stop.title} {stop.time ? `(${stop.time.split('T')[0]})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Weather Details Display */}
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

          {/* Plans Card */}
          <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-5 w-full text-left">
            {/* Header */}
            <div className="pb-3 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-black text-slate-900 dark:text-white text-lg">
                  Plans
                </h3>
              </div>
              <button
                onClick={handleOpenAddPlan}
                className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-900/60 rounded-xl text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Plan</span>
              </button>
            </div>

            {/* Sections */}
            <div className="space-y-6">
              {isTripStarted ? (
                <>
                  {/* Section 1: Today's Plans */}
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

                  {/* Section 2: Upcoming Plans (only when not on the last day or past) */}
                  {showUpcomingPlans && (
                    <>
                      {/* Separator line between the two sections */}
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
                /* When current date < trip start date: Only show Upcoming Plans */
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

            {/* Sponsored Banner Ad in Summary */}
            <div className="mt-6">
              <AdBanner type="sidebar" onOpenUpgradeModal={onOpenUpgradeModal} />
            </div>
          </div>
        </>
      )}

      {/* Shared Reusable Add Plan Modal */}
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

      {/* Shared Reusable Add Expense Modal */}
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

      {/* Modal: ADD TO-DO */}
      {showAddTodoModal && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 text-left relative">
            <button
              onClick={() => setShowAddTodoModal(false)}
              className="absolute right-4 top-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-3 pr-8">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900">
                <CheckSquare className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Add Checklist Item</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Add a task to your trip packing & prep checklist</p>
              </div>
            </div>

            <form onSubmit={handleSubmitAddTodo} className="space-y-3.5 pt-1">
              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-500 dark:text-slate-400 mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Buy travel insurance or Pack chargers"
                  value={todoTask}
                  onChange={(e) => setTodoTask(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-500 dark:text-slate-400 mb-1">Category</label>
                <select
                  value={todoCategory}
                  onChange={(e) => setTodoCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="Packing">Packing</option>
                  <option value="Documents">Documents & Passports</option>
                  <option value="Bookings">Bookings & Tickets</option>
                  <option value="General">General / Shopping</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAddTodoModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition cursor-pointer"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Map Picker Modal Overlay */}
      {activeMapPickerTarget &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col w-screen h-screen overflow-hidden">
            {/* Map Canvas */}
            <div className="relative flex-1 w-full h-full overflow-hidden">
              <ModalPickerMap
                pickerSelectedLat={pickerSelectedLat}
                pickerSelectedLng={pickerSelectedLng}
                setPickerSelectedLat={setPickerSelectedLat}
                setPickerSelectedLng={setPickerSelectedLng}
                setPickerSelectedAddress={setPickerSelectedAddress}
                setIsPickerGeocoding={setIsPickerGeocoding}
                flyToTrigger={flyToTrigger}
              />

              {/* Search Box at top */}
              <div className="absolute top-4 left-4 right-16 md:right-auto md:w-96 z-30">
                <div className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-full shadow-2xl flex items-center px-4 py-2.5 transition-all focus-within:ring-2 focus-within:ring-indigo-500/50">
                  <Search className="h-4 w-4 text-indigo-600 dark:text-indigo-400 mr-2.5 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search location, address or landmark..."
                    value={pickerSearchQuery}
                    onChange={(e) => handlePickerSearch(e.target.value)}
                    className="w-full text-xs bg-transparent outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 font-medium"
                  />
                  {pickerSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setPickerSearchQuery('');
                        setPickerSuggestions([]);
                      }}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-1 p-0.5 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Suggestions Dropdown */}
                {pickerSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                    {pickerSuggestions.map((s, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          const lat = Number(s.lat);
                          const lng = Number(s.lon || s.lng);
                          setPickerSelectedLat(lat);
                          setPickerSelectedLng(lng);
                          setPickerSelectedAddress(s.display_name || s.name);
                          setFlyToTrigger({ lat, lng, time: Date.now() });
                          setPickerSuggestions([]);
                          setPickerSearchQuery('');
                        }}
                        className="p-3 text-xs text-slate-750 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer flex items-center space-x-2.5 transition"
                      >
                        <span className="text-indigo-500 text-sm">📍</span>
                        <span className="truncate font-medium">
                          {s.display_name || s.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Right Close Button */}
              <div className="absolute top-4 right-4 z-30">
                <button
                  type="button"
                  onClick={() => setActiveMapPickerTarget(null)}
                  className="h-10 w-10 rounded-full bg-white/90 dark:bg-slate-900/90 hover:bg-white dark:hover:bg-slate-900 backdrop-blur-md text-slate-800 dark:text-white border border-slate-200 dark:border-slate-800 flex items-center justify-center transition-all shadow-xl hover:scale-105 active:scale-95 cursor-pointer"
                  title="Close map"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Center pin indicator */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(100%-4px)] z-20 pointer-events-none flex flex-col items-center">
                <div className="bg-indigo-600 text-white p-2.5 rounded-full shadow-2xl border-2 border-white flex items-center justify-center animate-bounce">
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="w-2.5 h-2.5 bg-indigo-900/60 rounded-full border border-white mt-1 shadow-md animate-pulse"></div>
              </div>

              {/* Geocoding Loading Indicator */}
              {isPickerGeocoding && (
                <div className="absolute top-18 left-4 z-30 bg-slate-900/90 backdrop-blur-md text-white px-3.5 py-1.5 rounded-full text-[10px] font-bold flex items-center space-x-2 shadow-lg border border-slate-800">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span>
                  <span>Fetching address details...</span>
                </div>
              )}

              {/* Bottom Floating Bar */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 w-[92vw] max-w-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3.5 px-5 rounded-full shadow-2xl border border-slate-200/90 dark:border-slate-800/90 flex items-center justify-between gap-4">
                <div className="text-left min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                    {pickerSelectedAddress || 'Selected location'}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    {pickerSelectedLat.toFixed(5)}, {pickerSelectedLng.toFixed(5)}
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveMapPickerTarget(null)}
                    className="px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-xs font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmPickerSelection}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-full text-xs transition shadow-md shadow-indigo-600/20 cursor-pointer"
                  >
                    Confirm Location
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

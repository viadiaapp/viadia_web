import React, { useEffect, useRef, useState, useMemo } from 'react';
import { MapPin, Globe, Award, ShieldAlert, Users, TrendingUp, Plus, Trash2, X, RefreshCw, Sparkles, Calendar, DollarSign, ArrowRight, Search, Share2, ChevronDown, KeyRound, Loader2, Check, Sun, Wind, Compass, LogOut } from 'lucide-react';
import { Trip, Place, ChecklistItem } from '../types';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import DateRangePicker from './DateRangePicker';
import CountryPickerModal from './CountryPickerModal';
import { getStaticCurrencies, initTripGclistStyling } from '../lib/db';
import { getCountryBannerUrl } from '../lib/countryBanners';
import emptyTripsImage from '../assets/images/empty_trips.png';
import { StaticCurrency } from '../data/staticCurrencies';
import { computeAutoStatus, getTripCategory, TripCategory } from '../lib/tripUtils';
import { isOwnerOfTrip } from '../lib/auth';
import { copyToClipboard } from '../lib/clipboardUtils';
import { useBackButton } from '../lib/backButtonHandler';
import { shareContent } from '../lib/nativeShareDownload';
import { fetchLiveForexRates } from '../lib/apiUtils';

interface WorldMapProps {
  trips: { [id: string]: Trip };
  activeTripId: string | null;
  onSetActiveTripId: (id: string | null) => void;
  onUpdateTrips: (updatedTrips: { [id: string]: Trip }) => void;
  onNewTripAdded?: () => void;
  appMode?: 'splash' | 'google-sync' | 'joined-trip' | 'local';
  onJoinTrip?: (code: string) => Promise<{ success: boolean; error?: string }>;
  user?: any;
  globalChecklist?: ChecklistItem[];
}


const COUNTRY_COORDS: { [key: string]: { lat: number; lng: number } } = {
  'France': { lat: 48.8566, lng: 2.3522 },
  'Japan': { lat: 35.6762, lng: 139.6503 },
  'Italy': { lat: 41.9028, lng: 12.4964 },
  'Spain': { lat: 40.4168, lng: -3.7038 },
  'United Kingdom': { lat: 51.5074, lng: -0.1278 },
  'United States': { lat: 40.7128, lng: -74.0060 },
  'Germany': { lat: 52.5200, lng: 13.4050 },
  'Switzerland': { lat: 46.9480, lng: 7.4474 },
  'India': { lat: 28.6139, lng: 77.2090 },
  'Australia': { lat: -33.8688, lng: 151.2093 },
  'Brazil': { lat: -22.9068, lng: -43.1729 },
  'Canada': { lat: 45.4215, lng: -75.6972 },
  'UAE': { lat: 25.2048, lng: 55.2708 },
  'Singapore': { lat: 1.3521, lng: 103.8198 },
  'Thailand': { lat: 13.7563, lng: 100.5018 },
  'South Korea': { lat: 37.5665, lng: 126.9780 },
  'Netherlands': { lat: 52.3676, lng: 4.9041 },
  'Indonesia': { lat: -8.4095, lng: 115.1889 },
};

const getWeatherInfo = (code: number) => {
  if (code === 0) return { label: 'Clear Sky', icon: '☀️' };
  if (code === 1 || code === 2) return { label: 'Partly Cloudy', icon: '⛅' };
  if (code === 3) return { label: 'Overcast', icon: '☁️' };
  if (code >= 45 && code <= 48) return { label: 'Foggy', icon: '🌫️' };
  if (code >= 51 && code <= 67) return { label: 'Rainy', icon: '🌧️' };
  if (code >= 71 && code <= 77) return { label: 'Snowy', icon: '❄️' };
  if (code >= 80 && code <= 82) return { label: 'Showers', icon: '🌦️' };
  if (code >= 95) return { label: 'Thunderstorm', icon: '🌩️' };
  return { label: 'Mild', icon: '🌤️' };
};

export default function WorldMap({ trips, activeTripId, onSetActiveTripId, onUpdateTrips, onNewTripAdded, appMode, onJoinTrip, user, globalChecklist }: WorldMapProps) {
  const tripsList = Object.values(trips);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerGroupRef = useRef<L.LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Search Filter State
  const [filterText, setFilterText] = useState('');
  const [shareToast, setShareToast] = useState<string | null>(null);

  const [currenciesList, setCurrenciesList] = useState<StaticCurrency[]>([]);

  useEffect(() => {
    async function load() {
      const data = await getStaticCurrencies();
      setCurrenciesList(data);
    }
    load();
  }, []);

  const defaultUSDExchangeRates = useMemo(() => {
    const rates: { [currency: string]: number } = {};
    currenciesList.forEach(c => {
      rates[c.currencyCode] = c.defaultExchangeRate || 1.0;
    });
    rates['USD'] = 1.0;
    return rates;
  }, [currenciesList]);

  const CURRENCIES = useMemo(() => {
    const map = new Map<string, { code: string; name: string; symbol: string }>();
    currenciesList.forEach(c => {
      if (!map.has(c.currencyCode)) {
        map.set(c.currencyCode, {
          code: c.currencyCode,
          name: c.currencyName,
          symbol: c.currencySymbol
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [currenciesList]);

  const COUNTRY_TO_CURRENCY = useMemo(() => {
    const map: { [key: string]: string } = {};
    currenciesList.forEach(c => {
      map[c.countryName] = c.currencyCode;
    });
    // Add custom/alias mappings for matching robustness
    map['United Kingdom (UK)'] = 'GBP';
    map['Great Britain'] = 'GBP';
    map['Czech Republic'] = 'CZK';
    map['Korea'] = 'KRW';
    map['UAE'] = 'AED';
    map['United States of America'] = 'USD';
    map['USA'] = 'USD';
    map['Vietnam'] = 'VND';
    return map;
  }, [currenciesList]);

  const getOfflineFallbackRate = (from: string, to: string): number => {
    const fFrom = defaultUSDExchangeRates[from.toUpperCase()] || 1.0;
    const fTo = defaultUSDExchangeRates[to.toUpperCase()] || 1.0;
    return Number((fTo / fFrom).toFixed(6));
  };

  // Helper to determine default tab from trips list:
  // If there is an ongoing trip, select that tab upon home page open.
  // If no ongoing trips, check if any upcoming trips exist -> select 'upcoming'.
  // If not -> select 'all'.
  const getDefaultTab = (list: Trip[]): 'all' | 'ongoing' | 'upcoming' | 'completed' | 'cancelled' => {
    let hasOngoing = false;
    let hasUpcoming = false;
    for (const t of list) {
      const cat = getTripCategory(t);
      if (cat === 'ongoing') hasOngoing = true;
      if (cat === 'upcoming') hasUpcoming = true;
    }
    if (hasOngoing) return 'ongoing';
    if (hasUpcoming) return 'upcoming';
    return 'all';
  };

  // Tab Filter State (All, Ongoing, Upcoming, Completed, Cancelled)
  const [activeTab, setActiveTab] = useState<'all' | 'ongoing' | 'upcoming' | 'completed' | 'cancelled'>(() => {
    return getDefaultTab(Object.values(trips));
  });

  const hasUserSelectedTabRef = useRef(false);

  useEffect(() => {
    if (!hasUserSelectedTabRef.current && tripsList.length > 0) {
      setActiveTab(getDefaultTab(tripsList));
    }
  }, [tripsList]);

  const handleSelectTab = (tabId: 'all' | 'ongoing' | 'upcoming' | 'completed' | 'cancelled') => {
    hasUserSelectedTabRef.current = true;
    setActiveTab(tabId);
  };

  // Custom Delete / Exit Confirm State
  const [deleteConfirmTrip, setDeleteConfirmTrip] = useState<{ id: string, title: string, isJoined?: boolean } | null>(null);

  // Add Trip Form State
  const [isAddingTrip, setIsAddingTrip] = useState(false);
  const [newTripTitle, setNewTripTitle] = useState('');
  const [newTripDesc, setNewTripDesc] = useState('');
  const [newTripStart, setNewTripStart] = useState('');
  const [newTripEnd, setNewTripEnd] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const [newTripCountries, setNewTripCountries] = useState('');
  const [newTripTravelers, setNewTripTravelers] = useState('');
  const [newTripBaseCurrency, setNewTripBaseCurrency] = useState('USD');
  const [hasManuallySetBaseCurrency, setHasManuallySetBaseCurrency] = useState(false);
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>([]);
  const [newTripBudget, setNewTripBudget] = useState('');
  const [showAdvancedCurrency, setShowAdvancedCurrency] = useState(false);
  const [customExchangeRates, setCustomExchangeRates] = useState<{ [currency: string]: string }>({});
  const [isFetchingRates, setIsFetchingRates] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [formValidationError, setFormValidationError] = useState<string | null>(null);

  // Sub-overlays & forms back button handlers
  useBackButton('worldmap-delete-confirm', deleteConfirmTrip !== null, () => setDeleteConfirmTrip(null), 110);
  useBackButton('worldmap-date-picker', showDatePicker, () => setShowDatePicker(false), 110);
  useBackButton('worldmap-country-picker', showCountryPicker, () => setShowCountryPicker(false), 110);
  useBackButton('worldmap-add-trip-form', isAddingTrip, () => setIsAddingTrip(false), 100);

  // Featured Trip for Highlights & Weather card on homepage
  const [featuredTripId, setFeaturedTripId] = useState<string | null>(null);
  const [homeWeather, setHomeWeather] = useState<{
    temp: number;
    code: number;
    wind: number;
    location: string;
    isDay: boolean;
  } | null>(null);
  const [homeWeatherLoading, setHomeWeatherLoading] = useState(false);
  const [homeWeatherError, setHomeWeatherError] = useState<string | null>(null);
  const [selectedStopIndex, setSelectedStopIndex] = useState<number>(0);

  const selectedTripForHighlights = useMemo(() => {
    if (featuredTripId && trips[featuredTripId]) {
      return trips[featuredTripId];
    }
    const active = tripsList.find(t => t.status === 'active');
    if (active) return active;
    const upcoming = tripsList.find(t => t.status === 'planned');
    if (upcoming) return upcoming;
    return tripsList[0] || null;
  }, [featuredTripId, trips, tripsList]);

  useEffect(() => {
    let isMounted = true;
    if (!selectedTripForHighlights) {
      setHomeWeather(null);
      return;
    }

    const fetchHomeWeather = async () => {
      setHomeWeatherLoading(true);
      setHomeWeatherError(null);
      try {
        let lat = 48.8566;
        let lng = 2.3522;
        let locationName = selectedTripForHighlights.title;

        const timeline = selectedTripForHighlights.timeline || [];
        if (timeline.length > 0) {
          const stop = timeline[Math.min(selectedStopIndex, timeline.length - 1)] || timeline[0];
          locationName = stop.name || selectedTripForHighlights.title;
          if (typeof stop.lat === 'number' && typeof stop.lng === 'number' && stop.lat !== 0) {
            lat = stop.lat;
            lng = stop.lng;
          } else {
            const firstCountry = selectedTripForHighlights.countries?.[0];
            if (firstCountry && COUNTRY_COORDS[firstCountry]) {
              lat = COUNTRY_COORDS[firstCountry].lat;
              lng = COUNTRY_COORDS[firstCountry].lng;
            }
          }
        } else {
          const firstCountry = selectedTripForHighlights.countries?.[0];
          if (firstCountry) {
            locationName = firstCountry;
            if (COUNTRY_COORDS[firstCountry]) {
              lat = COUNTRY_COORDS[firstCountry].lat;
              lng = COUNTRY_COORDS[firstCountry].lng;
            }
          }
        }

        let wData: any = null;
        try {
          const res = await fetch(`/api/weather?lat=${lat}&lng=${lng}`);
          if (res.ok) {
            wData = await res.json();
          }
        } catch {
          // Fallback to direct fetch
          try {
            const directRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&timezone=auto`);
            if (directRes.ok) wData = await directRes.json();
          } catch {
            // Ignore
          }
        }

        if (isMounted) {
          if (wData && wData.current_weather) {
            setHomeWeather({
              temp: wData.current_weather.temperature,
              code: wData.current_weather.weathercode,
              wind: wData.current_weather.windspeed,
              location: locationName,
              isDay: wData.current_weather.is_day === 1,
            });
          } else {
            setHomeWeather({
              temp: 22,
              code: 1,
              wind: 8.5,
              location: locationName,
              isDay: true,
            });
          }
        }
      } catch {
        if (isMounted) {
          setHomeWeather({
            temp: 22,
            code: 1,
            wind: 8.5,
            location: 'Destination',
            isDay: true,
          });
        }
      } finally {
        if (isMounted) setHomeWeatherLoading(false);
      }
    };

    fetchHomeWeather();
    return () => { isMounted = false; };
  }, [selectedTripForHighlights, selectedStopIndex]);


  // Join Trip Code Form State
  const [isJoiningTripCode, setIsJoiningTripCode] = useState(false);
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isSubmittingJoin, setIsSubmittingJoin] = useState(false);

  // Form scroll refs
  const addTripFormRef = useRef<HTMLFormElement>(null);
  const joinTripFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (isAddingTrip) {
      const timer = setTimeout(() => {
        addTripFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isAddingTrip]);

  useEffect(() => {
    if (isJoiningTripCode) {
      const timer = setTimeout(() => {
        joinTripFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isJoiningTripCode]);

  const handleJoinTripSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinInput || joinInput.trim().length !== 6) {
      setJoinError('Please enter a valid 6-character alphanumeric code.');
      return;
    }
    setJoinError(null);
    setIsSubmittingJoin(true);
    try {
      const result = await onJoinTrip?.(joinInput.trim().toUpperCase());
      if (result && !result.success) {
        setJoinError(result.error || 'Failed to find trip with this code.');
      } else if (result && result.success) {
        setIsJoiningTripCode(false);
        setJoinInput('');
      }
    } catch (err) {
      console.error(err);
      setJoinError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmittingJoin(false);
    }
  };

  // Group distinct countries by region and sort them
  const countriesByRegion = useMemo(() => {
    const groups: { [region: string]: StaticCurrency[] } = {};
    currenciesList.forEach(c => {
      const regionName = c.region || 'Other';
      if (!groups[regionName]) {
        groups[regionName] = [];
      }
      if (!groups[regionName].some(existing => existing.countryName === c.countryName)) {
        groups[regionName].push(c);
      }
    });

    const sortedRegions = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    const result: { region: string; countries: StaticCurrency[] }[] = [];
    
    sortedRegions.forEach(r => {
      const sortedCountries = [...groups[r]].sort((a, b) => a.countryName.localeCompare(b.countryName));
      result.push({ region: r, countries: sortedCountries });
    });

    return result;
  }, [currenciesList]);

  // Filter countries and regions based on search input
  const filteredCountriesByRegion = useMemo(() => {
    const query = countrySearchQuery.toLowerCase().trim();
    if (!query) return countriesByRegion;

    return countriesByRegion
      .map(group => {
        const matchingCountries = group.countries.filter(c => 
          c.countryName.toLowerCase().includes(query) ||
          (c.region && c.region.toLowerCase().includes(query)) ||
          c.currencyCode.toLowerCase().includes(query)
        );
        return {
          region: group.region,
          countries: matchingCountries
        };
      })
      .filter(group => group.countries.length > 0);
  }, [countriesByRegion, countrySearchQuery]);

  const handleConfirmCountries = (selectedCountryNames: string[]) => {
    setNewTripCountries(selectedCountryNames.join(', '));
    
    // Auto-select currency codes for the selected countries (excluding base currency)
    const nextCurrencies: string[] = [];
    selectedCountryNames.forEach(name => {
      const match = currenciesList.find(c => c.countryName === name);
      if (match && match.currencyCode) {
        const code = match.currencyCode.toUpperCase();
        if (code !== newTripBaseCurrency.toUpperCase() && !nextCurrencies.includes(code)) {
          nextCurrencies.push(code);
        }
      } else {
        const fallbackCode = COUNTRY_TO_CURRENCY[name];
        if (fallbackCode) {
          const code = fallbackCode.toUpperCase();
          if (code !== newTripBaseCurrency.toUpperCase() && !nextCurrencies.includes(code)) {
            nextCurrencies.push(code);
          }
        }
      }
    });
    
    setSelectedCurrencies(nextCurrencies);
    setShowCountryPicker(false);
    setFormValidationError(null);
  };

  // Compute counts for all 5 tabs
  const tabCounts = useMemo(() => {
    const counts = { all: tripsList.length, ongoing: 0, upcoming: 0, completed: 0, cancelled: 0 };
    tripsList.forEach((trip) => {
      const cat = getTripCategory(trip);
      if (counts[cat] !== undefined) {
        counts[cat]++;
      }
    });
    return counts;
  }, [tripsList]);

  // Compute filtered trips
  const filteredTrips = tripsList.filter(trip => {
    // 1. Filter by Active Tab
    if (activeTab !== 'all') {
      const category = getTripCategory(trip);
      if (category !== activeTab) return false;
    }

    // 2. Filter by search filterText
    if (!filterText.trim()) return true;
    const search = filterText.toLowerCase();
    const nameMatch = trip.title.toLowerCase().includes(search);
    const countryMatch = trip.countries?.some(c => c.toLowerCase().includes(search));
    const yearMatch = trip.startDate?.includes(search) || trip.endDate?.includes(search);
    return nameMatch || countryMatch || yearMatch;
  }).sort((a, b) => {
    // Sort everything in ascending order by start date
    const dateA = a.startDate || '9999-12-31';
    const dateB = b.startDate || '9999-12-31';
    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }
    return a.title.localeCompare(b.title);
  });

  // Parse additional currencies excluding the base currency
  const parsedCurrencies = selectedCurrencies.filter(c => c !== newTripBaseCurrency.toUpperCase());

  // Auto-generate computed offline exchange rates when currencies or base currency change
  useEffect(() => {
    const newRates = { ...customExchangeRates };
    let changed = false;
    parsedCurrencies.forEach(c => {
      if (!newRates[c]) {
        newRates[c] = String(getOfflineFallbackRate(newTripBaseCurrency, c));
        changed = true;
      }
    });
    if (changed) {
      setCustomExchangeRates(newRates);
    }
  }, [newTripBaseCurrency, selectedCurrencies.join(',')]);

  // Fetch exchange rates from free open rates API
  const handleFetchRates = async () => {
    if (!newTripBaseCurrency) return;
    setIsFetchingRates(true);
    setFetchError(null);
    try {
      const data = await fetchLiveForexRates(newTripBaseCurrency);
      if (data && data.rates) {
        const updatedRates: { [c: string]: string } = {};
        parsedCurrencies.forEach(c => {
          if (data.rates[c]) {
            updatedRates[c] = String(Number(data.rates[c]).toFixed(6));
          } else {
            updatedRates[c] = customExchangeRates[c] || '1.0';
          }
        });
        setCustomExchangeRates(prev => ({ ...prev, ...updatedRates }));
      } else {
        throw new Error('Invalid exchange rate structure');
      }
    } catch (err: any) {
      console.warn('Rate fetch warning:', err);
      setFetchError('Failed to fetch live rates. Using default computed offline rates.');
    } finally {
      setIsFetchingRates(false);
    }
  };

  const resetTripForm = () => {
    setNewTripTitle('');
    setNewTripDesc('');
    setNewTripStart('');
    setNewTripEnd('');
    setNewTripCountries('');
    setNewTripTravelers('');
    setNewTripBaseCurrency('USD');
    setHasManuallySetBaseCurrency(false);
    setSelectedCurrencies([]);
    setNewTripBudget('');
    setCustomExchangeRates({});
    setFetchError(null);
    setFormValidationError(null);
    setCountrySearchQuery('');
    setShowCountryPicker(false);
  };

  // Stats calculations
  const totalMiles = tripsList.reduce((sum, trip) => sum + (trip.miles || 0), 0);

  // Collect unique countries
  const countriesSet = new Set<string>();
  tripsList.forEach(t => t.countries?.forEach(c => countriesSet.add(c)));
  const totalCountries = countriesSet.size;

  // Collect unique travelers across all trips
  const travelersSet = new Set<string>();
  tripsList.forEach(t => t.travelers?.forEach(p => travelersSet.add(p)));
  const totalTravelers = travelersSet.size;

  // Total places visited
  const totalPlaces = tripsList.reduce((sum, trip) => sum + (trip.timeline?.length || 0), 0);

  // Initialize map once on mount
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const container = mapContainerRef.current as any;

    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch (e) {}
      mapInstanceRef.current = null;
    }

    if (container._leaflet_map) {
      try {
        container._leaflet_map.remove();
      } catch (e) {}
      container._leaflet_map = null;
    }

    container._leaflet_id = null;

    // Initialize map
    const map = L.map(container, {
      center: [20, 0],
      zoom: 2,
      zoomControl: true,
      scrollWheelZoom: true,
    });
    container._leaflet_map = map;

    mapInstanceRef.current = map;

    // Use clean tile layer based on current theme
    const isDarkWorldMap = document.documentElement.classList.contains('dark');
    const worldMapTileUrl = isDarkWorldMap
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

    L.tileLayer(worldMapTileUrl, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map);

    const markerGroup = L.layerGroup().addTo(map);
    markerGroupRef.current = markerGroup;

    setMapReady(true);

    return () => {
      setMapReady(false);
      map.stop();
      mapInstanceRef.current = null;
      markerGroupRef.current = null;
      map.remove();
    };
  }, []);

  // Update markers and lines whenever filteredTrips or mapReady changes
  useEffect(() => {
    if (!mapReady) return;
    const map = mapInstanceRef.current;
    const markerGroup = markerGroupRef.current;
    if (!map || !(map as any)._container || !markerGroup) return;

    // Clear previous markers
    markerGroup.clearLayers();

    // Render markers and paths for filtered trips
    filteredTrips.forEach((trip) => {
      const places = (trip.timeline || []).filter(p => !p.isDailyHotelStop);
      if (places.length === 0) return;

      const pathCoords: L.LatLngTuple[] = [];

      places.forEach((place) => {
        if (typeof place.lat !== 'number' || typeof place.lng !== 'number') return;

        pathCoords.push([place.lat, place.lng]);

        const isCompleted = trip.status === 'completed';
        const isActive = trip.status === 'active';
        
        let markerColorClass = 'bg-slate-400 border-white';
        let pulseColorClass = 'bg-slate-300';
        if (isCompleted) {
          markerColorClass = 'bg-indigo-600 border-indigo-200';
          pulseColorClass = 'bg-indigo-500';
        } else if (isActive) {
          markerColorClass = 'bg-indigo-600 border-indigo-200';
          pulseColorClass = 'bg-indigo-500';
        }

        const customIcon = L.divIcon({
          className: 'custom-marker',
          html: `
            <div class="relative w-4 h-4 flex items-center justify-center">
              <div class="absolute ${pulseColorClass} w-4 h-4 rounded-full animate-ping opacity-60"></div>
              <div class="w-3.5 h-3.5 rounded-full ${markerColorClass} border-2 shadow-sm"></div>
            </div>
          `,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        const popupContent = `
          <div class="p-1 pr-5 text-slate-800 font-sans min-w-[150px]">
            <div class="text-[9px] uppercase tracking-wider font-extrabold ${
              isCompleted ? 'text-indigo-600' : isActive ? 'text-emerald-600' : 'text-slate-500'
            }">${trip.status} Trip</div>
            <h4 class="font-bold text-xs text-slate-900 leading-tight">${place.title}</h4>
            <div class="text-[10px] text-slate-600 font-medium truncate max-w-[150px] mt-0.5">Part of: <strong class="text-slate-900">${trip.title}</strong></div>
          </div>
        `;

        L.marker([place.lat, place.lng], { icon: customIcon })
          .bindPopup(popupContent, { closeButton: true })
          .addTo(markerGroup);
      });

      // Draw dashed paths between timeline stops
      if (pathCoords.length > 1) {
        const isCompleted = trip.status === 'completed';
        const isActive = trip.status === 'active';
        const pathColor = isCompleted ? '#4f46e5' : isActive ? '#10b981' : '#94a3b8';

        L.polyline(pathCoords, {
          color: pathColor,
          weight: 2,
          opacity: 0.6,
          dashArray: '6, 8',
        }).addTo(markerGroup);
      }
    });

    // Zoom and center map to show all elements if filtered trips exist
    const allCoords: L.LatLngTuple[] = [];
    filteredTrips.forEach(t => t.timeline?.filter(p => !p.isDailyHotelStop).forEach(p => {
      if (typeof p.lat === 'number' && typeof p.lng === 'number') {
        allCoords.push([p.lat, p.lng]);
      }
    }));

    if (allCoords.length > 0) {
      map.fitBounds(L.latLngBounds(allCoords), { padding: [50, 50], maxZoom: 12, animate: true, duration: 0.4 });
    }
  }, [mapReady, filteredTrips]);

  // Handle focusing on a single trip on the map
  const handleTripFocus = (trip: Trip) => {
    onSetActiveTripId(trip.id);
    const coords: L.LatLngTuple[] = [];
    trip.timeline?.forEach(p => {
      if (typeof p.lat === 'number' && typeof p.lng === 'number') {
        coords.push([p.lat, p.lng]);
      }
    });

    const map = mapInstanceRef.current;
    if (coords.length > 0 && map && (map as any)._container) {
      if (coords.length === 1) {
        map.flyTo(coords[0], 10, { animate: true, duration: 0.35 });
      } else {
        map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], animate: true, duration: 0.35 });
      }
    }
  };

  // Auto-focus the map on activeTripId changes
  useEffect(() => {
    if (!mapReady) return;
    const map = mapInstanceRef.current;
    if (activeTripId && map && (map as any)._container) {
      const trip = trips[activeTripId];
      if (trip) {
        const coords: L.LatLngTuple[] = [];
        trip.timeline?.forEach(p => {
          if (typeof p.lat === 'number' && typeof p.lng === 'number') {
            coords.push([p.lat, p.lng]);
          }
        });
        if (coords.length > 0) {
          if (coords.length === 1) {
            map.flyTo(coords[0], 10, { animate: true, duration: 0.35 });
          } else {
            map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], animate: true, duration: 0.35 });
          }
        }
      }
    }
  }, [mapReady, activeTripId]);

  // Submit adding new trip
  const handleAddTrip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTripTitle.trim()) {
      setFormValidationError('Please enter a trip title.');
      return;
    }

    if (!newTripStart || !newTripEnd) {
      setFormValidationError('Trip dates are required! Please select both start and end dates.');
      return;
    }

    if (newTripEnd < newTripStart) {
      setFormValidationError('The end date cannot be before the start date.');
      return;
    }

    setFormValidationError(null);

    const countriesArr = newTripCountries
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0);

    const travelersArr = newTripTravelers
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    const baseUpper = newTripBaseCurrency.toUpperCase();
    const allCurrenciesSet = new Set<string>();
    allCurrenciesSet.add(baseUpper);
    parsedCurrencies.forEach(c => allCurrenciesSet.add(c));
    const currenciesArr = Array.from(allCurrenciesSet);

    const initialRates: { [c: string]: number } = { [baseUpper]: 1.0 };
    parsedCurrencies.forEach(c => {
      initialRates[c] = Number(customExchangeRates[c]) || getOfflineFallbackRate(newTripBaseCurrency, c);
    });

    const tripCode = (() => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      do {
        result = '';
        for (let i = 0; i < 6; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
      } while (tripsList.some(t => t.id === result || t.code === result));
      return result;
    })();

    const computedStatus = computeAutoStatus(newTripStart, newTripEnd);

    const newTrip: Trip = {
      id: tripCode,
      code: tripCode,
      title: newTripTitle,
      description: newTripDesc,
      status: computedStatus,
      startDate: newTripStart,
      endDate: newTripEnd,
      countries: countriesArr.length > 0 ? countriesArr : [],
      miles: 0,
      travelers: travelersArr.length > 0 ? travelersArr : ['Me'],
      timeline: [],
      expenses: [],
      checklist: [],
      baseCurrency: baseUpper,
      currencies: currenciesArr,
      exchangeRates: initialRates,
      budgetLimit: newTripBudget && !isNaN(Number(newTripBudget)) && Number(newTripBudget) > 0 ? Number(newTripBudget) : undefined,
      paymentTypes: ['Cash', 'Credit Card', 'Debit Card'],
      categories: ['Food', 'Airline Tickets', 'Accommodation', 'Visa Fee', 'Shopping', 'Activities', 'Other'],
      ownerUid: user?.uid || undefined,
      allowOthersToModify: false // Default is r (read-only for non-owners)
    };

    onUpdateTrips({ ...trips, [newTrip.id]: newTrip });
    initTripGclistStyling(tripCode, globalChecklist || []);
    onSetActiveTripId(newTrip.id);
    setIsAddingTrip(false);
    resetTripForm();
    if (onNewTripAdded) {
      onNewTripAdded();
    }
  };

  // Delete trip
  const handleDeleteTrip = (id: string) => {
    const updatedTrips = { ...trips };
    delete updatedTrips[id];
    onUpdateTrips(updatedTrips);
    if (activeTripId === id) {
      const remainingIds = Object.keys(updatedTrips);
      onSetActiveTripId(remainingIds[0] || null);
    }
  };

  // Calculate lifetime travel stats
  const activeAndPlannedTrips = tripsList.filter(t => t.status !== 'cancelled');
  const totalTrips = activeAndPlannedTrips.length;
  const uniqueCountries = Array.from(
    new Set(activeAndPlannedTrips.flatMap(t => t.countries || []).filter(Boolean))
  );
  const lifetimeCountries = uniqueCountries.length;
  
  const getDaysCount = (start: string, end: string) => {
    if (!start || !end) return 0;
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    const diffTime = Math.abs(e.getTime() - s.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };
  
  const lifetimeDays = activeAndPlannedTrips
    .reduce((sum, t) => sum + getDaysCount(t.startDate, t.endDate), 0);

  // Travel level based on total completed or overall trips
  let travelRank = 'Novice Explorer';
  let rankColor = 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 border border-slate-200/40 dark:border-slate-750/45';
  let nextRankLabel: string | null = 'Active Wanderer';
  let rankTierStart = 0;
  let rankTierEnd = 4;

  if (totalTrips >= 16) {
    travelRank = 'Elite Nomad';
    rankColor = 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/45 dark:border-amber-900/40';
    nextRankLabel = null;
    rankTierStart = 16;
    rankTierEnd = 16;
  } else if (totalTrips >= 9) {
    travelRank = 'Globe Trotter';
    rankColor = 'text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200/45 dark:border-indigo-900/40';
    nextRankLabel = 'Elite Nomad';
    rankTierStart = 9;
    rankTierEnd = 16;
  } else if (totalTrips >= 4) {
    travelRank = 'Active Wanderer';
    rankColor = 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/45 dark:border-emerald-900/40';
    nextRankLabel = 'Globe Trotter';
    rankTierStart = 4;
    rankTierEnd = 9;
  }

  const rankProgress = nextRankLabel
    ? Math.min(100, Math.max(0, ((totalTrips - rankTierStart) / (rankTierEnd - rankTierStart)) * 100))
    : 100;

  return (
    <div className="space-y-8">

      {/* SECTION 1: YOUR TRIPS EXPLORER */}
      <div className="space-y-6">
        {/* Homepage Card: Travel Milestones */}
        <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-5 transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 rounded-2xl text-indigo-600 dark:text-indigo-400 shrink-0">
                <Sparkles className="h-4 w-4 animate-pulse" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Travel Milestones</h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Lifetime travel achievements & stats</p>
              </div>
            </div>
            <span className={`flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-xl font-bold tracking-wide uppercase shrink-0 ${rankColor}`}>
              <Award className="h-3.5 w-3.5" />
              {travelRank}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/25 border border-indigo-100/70 dark:border-indigo-900/40">
              <MapPin className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0 mb-1" />
              <span className="text-xl font-black text-indigo-700 dark:text-indigo-300 leading-none">{totalTrips}</span>
              <span className="text-[9px] text-indigo-500/80 dark:text-indigo-400/70 font-bold uppercase tracking-wider mt-1.5">Adventures</span>
            </div>

            <div className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/25 border border-emerald-100/70 dark:border-emerald-900/40">
              <Globe className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mb-1" />
              <span className="text-xl font-black text-emerald-700 dark:text-emerald-300 leading-none">{lifetimeCountries}</span>
              <span className="text-[9px] text-emerald-500/80 dark:text-emerald-400/70 font-bold uppercase tracking-wider mt-1.5">Countries</span>
            </div>

            <div className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/25 border border-amber-100/70 dark:border-amber-900/40">
              <Calendar className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mb-1" />
              <span className="text-xl font-black text-amber-700 dark:text-amber-300 leading-none">{lifetimeDays}</span>
              <span className="text-[9px] text-amber-500/80 dark:text-amber-400/70 font-bold uppercase tracking-wider mt-1.5">Days on Road</span>
            </div>
          </div>

          {/* Progress toward next travel rank */}
          {nextRankLabel ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <span>{totalTrips} of {rankTierEnd} trips</span>
                <span>Next: {nextRankLabel}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-500"
                  style={{ width: `${rankProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center space-x-1.5 text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              <Award className="h-3 w-3" />
              <span>Maximum rank achieved</span>
            </div>
          )}
        </div>

        {/* Homepage Card: Plan & Join Trips */}
        <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 transition-all hover:shadow-md text-left">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 rounded-2xl text-indigo-600 dark:text-indigo-400">
                <Compass className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Plan & Join Trips</h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Create a new itinerary or connect to a shared trip</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                setIsAddingTrip(!isAddingTrip);
                setIsJoiningTripCode(false);
              }}
              className={`flex items-center justify-center space-x-1.5 px-3 sm:px-4 py-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                isAddingTrip
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                  : 'bg-slate-50 dark:bg-slate-950/60 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40 text-slate-800 dark:text-slate-100 border-slate-200/80 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900/60'
              }`}
            >
              <Plus className={`h-4 w-4 shrink-0 ${isAddingTrip ? 'text-white' : 'text-indigo-500'}`} />
              <span>Plan a trip</span>
            </button>
            {onJoinTrip && (
              <button
                onClick={() => {
                  setIsJoiningTripCode(!isJoiningTripCode);
                  setIsAddingTrip(false);
                  setJoinError(null);
                  setJoinInput('');
                }}
                className={`flex items-center justify-center space-x-1.5 px-3 sm:px-4 py-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                  isJoiningTripCode
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                    : 'bg-slate-50 dark:bg-slate-950/60 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40 text-slate-800 dark:text-slate-100 border-slate-200/80 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900/60'
                }`}
              >
                <KeyRound className={`h-4 w-4 shrink-0 ${isJoiningTripCode ? 'text-white' : 'text-indigo-500'}`} />
                <span>Join a trip</span>
              </button>
            )}
          </div>

          {/* Expandable Join Trip Form */}
          {isJoiningTripCode && (
            <form ref={joinTripFormRef} onSubmit={handleJoinTripSubmit} className="pt-4 border-t border-slate-100 dark:border-slate-800/60 space-y-3.5 text-left animate-in fade-in duration-200 scroll-mt-24">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/60 pb-2">
                <h4 className="text-sm font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-tight flex items-center space-x-2">
                  <KeyRound className="h-4.5 w-4.5" />
                  <span>Join a Shared Trip</span>
                </h4>
                <button type="button" onClick={() => setIsJoiningTripCode(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Trip Code</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="e.g. TOKYO8"
                    value={joinInput}
                    onChange={e => {
                      setJoinInput(e.target.value.toUpperCase().slice(0, 6));
                      setJoinError(null);
                    }}
                    className="w-full text-xs px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-indigo-500 outline-none text-slate-800 dark:text-slate-100 font-mono tracking-widest text-center"
                  />
                </div>

                {joinError && (
                  <p className="text-[11px] text-rose-500 font-semibold">{joinError}</p>
                )}

                <button
                  type="submit"
                  disabled={isSubmittingJoin || joinInput.length !== 6}
                  className="w-full h-10 flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm hover:shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingJoin ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span>Connect to Trip</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Expandable Add Trip Form */}
          {isAddingTrip && (
            <form ref={addTripFormRef} onSubmit={handleAddTrip} className="pt-4 border-t border-slate-100 dark:border-slate-800/60 space-y-4 text-left animate-in fade-in duration-200 scroll-mt-24">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/60 pb-2.5">
                <h4 className="text-sm font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-tight flex items-center space-x-2">
                  <Globe className="h-4.5 w-4.5" />
                  <span>Create New Trip</span>
                </h4>
                <button type="button" onClick={() => setIsAddingTrip(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Trip Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Europe Backpacking Trip"
                  value={newTripTitle}
                  onChange={e => setNewTripTitle(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-indigo-500 outline-none text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Description</label>
                <textarea
                  placeholder="A short overview of your places, hotels, and travel sights..."
                  value={newTripDesc}
                  onChange={e => setNewTripDesc(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-indigo-500 outline-none text-slate-800 dark:text-slate-100 h-16 resize-none"
                />
              </div>

              <div className="space-y-1 md:col-span-2 relative">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Trip Dates</label>
                <button
                  type="button"
                  onClick={() => setShowDatePicker(true)}
                  className="w-full flex items-center justify-between text-xs px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500 text-left cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-900/55 transition shadow-xs"
                >
                  <span className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-indigo-500 shrink-0" />
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      {newTripStart && newTripEnd 
                        ? `${newTripStart}   ➜   ${newTripEnd}`
                        : 'Select start and end date'}
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
                </button>

                {showDatePicker && (
                  <>
                    <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs z-45" onClick={() => setShowDatePicker(false)} />
                    <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-[290px] sm:max-w-[310px]">
                      <div className="z-50 relative">
                        <DateRangePicker
                          initialStartDate={newTripStart}
                          initialEndDate={newTripEnd}
                          onApply={(start, end) => {
                            setNewTripStart(start);
                            setNewTripEnd(end);
                            setShowDatePicker(false);
                            setFormValidationError(null); // clear date validation error if resolved
                          }}
                          onClose={() => setShowDatePicker(false)}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-1 relative">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Destination</label>
                <button
                  type="button"
                  onClick={() => setShowCountryPicker(true)}
                  className="w-full flex items-center justify-between text-xs px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500 text-left cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-900/55 transition shadow-xs"
                >
                  <span className="flex items-center space-x-2 truncate">
                    <Globe className="h-4 w-4 text-indigo-500 shrink-0" />
                    <span className="text-slate-700 dark:text-slate-300 font-medium truncate">
                      {newTripCountries 
                        ? newTripCountries
                        : 'Select Destination'}
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
                </button>

                <CountryPickerModal
                  isOpen={showCountryPicker}
                  onClose={() => setShowCountryPicker(false)}
                  initialSelectedCountries={newTripCountries}
                  currenciesList={currenciesList}
                  onConfirm={handleConfirmCountries}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Travelers</label>
                <input
                  type="text"
                  placeholder="Me, Sarah, David (comma separated)"
                  value={newTripTravelers}
                  onChange={e => setNewTripTravelers(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500"
                />
              </div>

              {/* Main Currency Selector Input (Themed) */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center justify-between">
                  <span>Primary Base Currency</span>
                </label>
                <div className="relative flex items-center">
                  <select
                    value={newTripBaseCurrency}
                    onChange={e => {
                      const selectedBase = e.target.value;
                      setNewTripBaseCurrency(selectedBase);
                      setHasManuallySetBaseCurrency(true);
                      setSelectedCurrencies(prev => prev.filter(c => c !== selectedBase));
                    }}
                    className="w-full text-xs px-3.5 py-2.5 bg-indigo-50/40 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60 rounded-xl text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 font-bold focus:ring-2 focus:ring-indigo-500/20 cursor-pointer transition shadow-xs"
                  >
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.code} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-sans">
                        {c.code} ({c.symbol}) — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Advanced Settings Toggle Button */}
              <div className="md:col-span-2 border-t border-slate-100 dark:border-slate-800/60 pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setShowAdvancedCurrency(!showAdvancedCurrency)}
                  className="flex items-center justify-between w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 rounded-xl border border-slate-200/60 dark:border-slate-800 transition shadow-xs cursor-pointer"
                >
                  <span className="flex items-center space-x-2">
                    <RefreshCw className={`h-4 w-4 text-indigo-500 transition-transform duration-300 ${showAdvancedCurrency ? 'rotate-180' : ''}`} />
                    <span>Currency & Forex Settings</span>
                  </span>
                  <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-650 dark:text-slate-350 px-2.5 py-0.5 rounded-lg font-extrabold font-mono border border-slate-300/40 dark:border-slate-700/40">
                    {showAdvancedCurrency ? 'HIDE' : 'CONFIGURE'}
                  </span>
                </button>

                {showAdvancedCurrency && (
                  <div className="mt-3 p-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-850/70 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="space-y-3">
                      {/* Base Currency Selection */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Quote Currency</label>
                        <select
                          value={newTripBaseCurrency}
                          onChange={e => {
                            const selectedBase = e.target.value;
                            setNewTripBaseCurrency(selectedBase);
                            setHasManuallySetBaseCurrency(true);
                            // Remove selected base currency from multi-select options
                            setSelectedCurrencies(prev => prev.filter(c => c !== selectedBase));
                          }}
                          className="w-full text-xs px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 font-bold"
                        >
                          {CURRENCIES.map(c => (
                            <option key={c.code} value={c.code}>
                              {c.code} (Symbol: {c.symbol}) - {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* All Currencies Multi-Select Options List */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">Required Currencies (Multi-Select)</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-white dark:bg-slate-900 max-h-36 overflow-y-auto">
                          {CURRENCIES.filter(c => c.code !== newTripBaseCurrency).map(c => {
                            const isSelected = selectedCurrencies.includes(c.code);
                            return (
                              <button
                                key={c.code}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedCurrencies(selectedCurrencies.filter(code => code !== c.code));
                                  } else {
                                    setSelectedCurrencies([...selectedCurrencies, c.code]);
                                  }
                                }}
                                className={`flex flex-col items-start px-2.5 py-1.5 rounded-lg border text-left transition-all ${
                                  isSelected
                                    ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-400 font-semibold'
                                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-150 dark:border-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                <span className="text-[10px] font-bold font-mono">{c.code} ({c.symbol})</span>
                                <span className="text-[8px] text-slate-400 dark:text-slate-500 truncate w-full">{c.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Live Rate Fetcher */}
                      <div className="space-y-3 border-t border-slate-200 dark:border-slate-800/50 pt-4">
                        <button
                          type="button"
                          onClick={handleFetchRates}
                          disabled={isFetchingRates || parsedCurrencies.length === 0}
                          className="w-full py-2.5 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/45 text-indigo-700 dark:text-indigo-400 text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition flex items-center justify-center space-x-1 disabled:opacity-50 cursor-pointer"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${isFetchingRates ? 'animate-spin' : ''}`} />
                          <span>⚡ Fetch Live Exchange Rates</span>
                        </button>

                        {fetchError && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold text-center leading-tight">{fetchError}</p>
                        )}

                        {parsedCurrencies.length > 0 && (
                          <div className="space-y-2 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                            <label className="text-[10px] font-bold text-slate-500 uppercase block border-b border-slate-100 dark:border-slate-800 pb-1.5">Set Custom Default Exchange Rates</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              {parsedCurrencies.map(currency => (
                                <div key={currency} className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950/50 p-2 rounded-lg border border-slate-150 dark:border-slate-850">
                                  <span className="text-[10px] text-slate-500 font-mono font-bold">1 {newTripBaseCurrency.toUpperCase()} =</span>
                                  <div className="flex items-center space-x-1.5">
                                    <input
                                      type="number"
                                      step="any"
                                      required
                                      value={customExchangeRates[currency] || ''}
                                      placeholder="1.0"
                                      onChange={e => setCustomExchangeRates({
                                        ...customExchangeRates,
                                        [currency]: e.target.value
                                      })}
                                      className="w-20 text-right text-[10px] px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-slate-800 dark:text-slate-100 font-mono outline-none"
                                    />
                                    <span className="text-[10px] text-slate-700 dark:text-slate-300 font-bold w-10">{currency}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <p className="text-[8px] text-slate-400 dark:text-slate-500 mt-1 leading-normal">Rates denote how much foreign currency corresponds to 1 unit of your base currency ({newTripBaseCurrency.toUpperCase()}).</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Trip Budget Input Field */}
              <div className="space-y-1 md:col-span-2 pt-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between">
                  <span>Trip Budget ({newTripBaseCurrency.toUpperCase()})</span>
                  <span className="text-[9px] text-slate-400 font-normal">Trip Budget (Optional)</span>
                </label>
                <div className="flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus-within:border-indigo-500 overflow-hidden px-3.5 py-2.5 space-x-2">
                  <span className="text-xs font-bold text-slate-400 font-mono select-none shrink-0">
                    {CURRENCIES.find(c => c.code === newTripBaseCurrency.toUpperCase())?.symbol || newTripBaseCurrency.toUpperCase()}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="e.g. 2500"
                    value={newTripBudget}
                    onChange={e => setNewTripBudget(e.target.value)}
                    className="w-full text-xs bg-transparent outline-none text-slate-800 dark:text-slate-100 font-mono font-semibold"
                  />
                </div>
              </div>
            </div>

            {formValidationError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs font-semibold text-rose-750 dark:text-rose-400 flex items-center space-x-2 animate-in fade-in slide-in-from-top-1 duration-150">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                <p>{formValidationError}</p>
              </div>
            )}

            <div className="pt-4 flex gap-3 border-t border-slate-100 dark:border-slate-800/60">
              <button
                type="button"
                onClick={() => setIsAddingTrip(false)}
                className="flex-1 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-sm cursor-pointer"
              >
                Save New Trip
              </button>
            </div>
          </form>
        )}
        </div>

        {/* 2. Next: HEADER MY TRIPS */}
        <div className="text-left mt-4 flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-200/50 dark:border-indigo-800/50">
            <Compass className="h-4.5 w-4.5" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">My Trips</h2>
        </div>

        {/* 3. Then: SEARCH FILTER INPUT */}
        <div className="relative w-full max-w-md text-left">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Filter by country, year, or name..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="pl-10 pr-4 py-2 w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 dark:text-slate-100 transition-all shadow-inner placeholder:text-slate-400"
          />
          {filterText && (
            <button
              onClick={() => setFilterText('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* 4. Tab Filters: All, Ongoing, Upcoming, Completed, Cancelled */}
        <div className="w-full max-w-full overflow-x-auto p-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 my-4 touch-pan-x scrollbar-none overscroll-x-contain">
          <div className="flex items-center gap-1.5 min-w-max sm:min-w-full sm:w-full">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'ongoing', label: 'Ongoing' },
                { id: 'upcoming', label: 'Upcoming' },
                { id: 'completed', label: 'Completed' },
                { id: 'cancelled', label: 'Cancelled' },
              ] as const
            ).map((tab) => {
              const isActive = activeTab === tab.id;
              const count = tabCounts[tab.id] || 0;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleSelectTab(tab.id)}
                  className={`flex-1 min-w-[105px] sm:min-w-0 py-2.5 px-3 text-xs font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer select-none whitespace-nowrap ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold transition-colors ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Trips List Grid Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 text-left">
          {filteredTrips.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center text-center py-12 px-4 sm:px-6 bg-white/70 dark:bg-slate-900/70 rounded-3xl border border-dashed border-slate-200/90 dark:border-slate-800 backdrop-blur-xs">
              <div className="relative w-52 h-52 sm:w-64 sm:h-64 mb-3">
                <img
                  src={emptyTripsImage}
                  alt="Empty travel backpack"
                  className="w-full h-full object-contain drop-shadow-sm select-none pointer-events-none"
                  loading="lazy"
                />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                Plan a trip! Its empty down here!
              </h3>
            </div>
          ) : (
            filteredTrips.map((trip) => {
              const isSelected = activeTripId === trip.id;
              const category = getTripCategory(trip);
              const isCompleted = category === 'completed';
              const isOngoing = category === 'ongoing';
              const isCancelled = category === 'cancelled';
              return (
                <div
                  key={trip.id}
                  onClick={() => handleTripFocus(trip)}
                  className={`text-left rounded-3xl border cursor-pointer transition-all relative group flex flex-col overflow-hidden bg-white dark:bg-slate-900 ${
                    isSelected
                      ? 'border-indigo-500 dark:border-indigo-400 shadow-lg ring-1 ring-indigo-500/30'
                      : 'border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  {/* Photo Banner — destination image from the trip's countries, with title/status/dates overlaid */}
                  <div className="relative h-32 sm:h-36 overflow-hidden">
                    <img
                      src={getCountryBannerUrl(trip.countries, trip.title)}
                      alt={trip.title}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/0" />

                    <span className={`absolute top-3 right-3 text-[9px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider backdrop-blur-md border ${
                      isCancelled
                        ? 'bg-rose-500/30 text-rose-100 border-rose-300/40'
                        : isCompleted
                        ? 'bg-indigo-500/30 text-indigo-100 border-indigo-300/40'
                        : isOngoing
                        ? 'bg-emerald-500/30 text-emerald-100 border-emerald-300/40 animate-pulse'
                        : 'bg-white/20 text-white border-white/30'
                    }`}>
                      {category}
                    </span>

                    {isSelected && (
                      <div className="absolute top-3 left-3 bg-indigo-600 text-white rounded-full p-1.5 shadow-lg">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                    )}

                    <div className="absolute bottom-3 left-4 right-4">
                      <h4 className="font-black text-base text-white leading-tight line-clamp-1 drop-shadow-sm">{trip.title}</h4>
                      <span className="text-[10px] text-white/80 font-semibold block mt-0.5">
                        {trip.startDate || '?'} to {trip.endDate || '?'}
                      </span>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-5.5 flex flex-col flex-1 justify-between">
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-normal">{trip.description || 'No description provided.'}</p>
                  
                  <div className="mt-4 pt-3.5 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-bold tracking-tight border-t border-slate-100 dark:border-slate-800/60">
                    <div className="flex flex-col space-y-0.5 min-w-0 pr-2">
                      <span className="truncate max-w-[120px] text-slate-400 dark:text-slate-500">{trip.countries?.join(', ') || 'Global'}</span>
                      <span className="text-slate-400 dark:text-slate-500">Base: <strong className="text-slate-600 dark:text-slate-300 font-mono font-bold">{trip.baseCurrency || 'USD'}</strong></span>
                    </div>

                    {/* Share & Delete Action Buttons */}
                    <div className="flex items-center space-x-1.5 flex-shrink-0 z-10">
                      {(trip.isJoined === true || (trip.ownerUid && !trip.ownerUid.startsWith('guest_') && !isOwnerOfTrip(trip, user))) && (
                        <div className="flex items-center space-x-1 px-2 py-1 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100/30 dark:border-indigo-900/40 text-[9px] text-indigo-700 dark:text-indigo-400 rounded-lg font-bold tracking-wide uppercase flex-shrink-0">
                          <span>Joined</span>
                        </div>
                      )}

                      {/* Trip code badge just beside to the left of the share button */}
                      <span className="px-2 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 text-[10px] font-mono font-bold border border-indigo-150/40 dark:border-indigo-900/40 uppercase tracking-widest whitespace-nowrap shadow-3xs" title="Trip Code">
                        {trip.code || trip.id.substring(0, 6).toUpperCase()}
                      </span>

                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            let codeToShare = '';
                            try {
                              const res = await fetch('/api/trips', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ trip })
                              });
                              if (res.ok) {
                                const data = await res.json();
                                codeToShare = data.code;
                              } else {
                                codeToShare = trip.id.substring(0, 6).toUpperCase();
                              }
                            } catch (fetchErr) {
                              console.warn('Network error sharing, using offline code fallback:', fetchErr);
                              codeToShare = trip.id.substring(0, 6).toUpperCase();
                            }

                            const tripName = trip.title || (trip as any).destination || 'My Trip';
                            const message = `✈️ Join me on ViaDia for the trip "${tripName}"!\n\nUse trip code: ${codeToShare}\n\nOpen ViaDia, tap "Join a Shared Trip", and enter code ${codeToShare} to view and plan our itinerary, checklist, and expenses together. \n\nwww.viadia.in`;

                            const shareResult = await shareContent({
                              title: 'ViaDia Trip Invitation',
                              text: message,
                              url: window.location.origin,
                              dialogTitle: `Share "${tripName}" Trip Code`
                            });

                            if (shareResult.method === 'clipboard' && shareResult.success) {
                              setShareToast(`Invitation copied to clipboard! Share code "${codeToShare}" with your friends.`);
                              setTimeout(() => setShareToast(null), 4000);
                            }
                          } catch (err) {
                            console.error('Error sharing trip from map card:', err);
                          }
                        }}
                        className="p-1.5 rounded-xl bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 opacity-70 hover:opacity-100 transition-all shadow-sm cursor-pointer flex items-center justify-center"
                        title="Share Trip & Get Join Code"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </button>
                      {(trip.isJoined === true || (trip.ownerUid && !trip.ownerUid.startsWith('guest_') && !isOwnerOfTrip(trip, user))) ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmTrip({ id: trip.id, title: trip.title, isJoined: true });
                          }}
                          className="p-1.5 rounded-xl bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 opacity-70 hover:opacity-100 transition-all shadow-sm cursor-pointer flex items-center justify-center"
                          title="Exit Trip"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmTrip({ id: trip.id, title: trip.title, isJoined: false });
                          }}
                          className="p-1.5 rounded-xl bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 opacity-70 hover:opacity-100 transition-all shadow-sm cursor-pointer flex items-center justify-center"
                          title="Delete Trip"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      {/* CUSTOM RECONCILING SAFETY DELETE / EXIT MODAL (Iframe Safe) */}
      {deleteConfirmTrip && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 p-6 sm:p-7 rounded-[28px] max-w-sm w-full space-y-4 shadow-2xl text-center">
            <div className={`p-3.5 rounded-full w-max mx-auto shadow-sm ${
              deleteConfirmTrip.isJoined
                ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400'
                : 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
            }`}>
              {deleteConfirmTrip.isJoined ? <LogOut className="h-6 w-6" /> : <Trash2 className="h-6 w-6" />}
            </div>
            <div className="space-y-2">
              <h4 className="font-sans font-bold text-lg text-slate-900 dark:text-white">
                {deleteConfirmTrip.isJoined ? 'Exit Trip?' : 'Delete Trip?'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                {deleteConfirmTrip.isJoined ? (
                  <>Are you sure you want to exit <strong className="text-slate-800 dark:text-slate-200">&quot;{deleteConfirmTrip.title}&quot;</strong>? It will be removed from your trip list on this device.</>
                ) : (
                  <>Are you sure you want to delete <strong className="text-slate-800 dark:text-slate-200">&quot;{deleteConfirmTrip.title}&quot;</strong>? This will permanently delete all of its timeline stops and expenses as well.</>
                )}
              </p>
            </div>
            <div className="flex gap-3 pt-2.5">
              <button
                onClick={() => setDeleteConfirmTrip(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleDeleteTrip(deleteConfirmTrip.id);
                  setDeleteConfirmTrip(null);
                }}
                className={`flex-1 py-2 text-white font-bold rounded-xl text-xs transition shadow-md cursor-pointer ${
                  deleteConfirmTrip.isJoined
                    ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/10'
                    : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/10'
                }`}
              >
                {deleteConfirmTrip.isJoined ? 'Exit Trip' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Share Toast Notification */}
      {shareToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-full shadow-2xl flex items-center space-x-2 animate-in fade-in duration-200">
          <Check className="h-4 w-4 shrink-0" />
          <span>{shareToast}</span>
        </div>
      )}
    </div>
  );
}

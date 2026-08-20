import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, MapPin, Search, Upload, Calendar, Clock, Building2, Plane, Car, Train, Bus, AlertTriangle, Trash2, Minus, Layers } from 'lucide-react';
import { Trip, Place } from '../types';
import { compressImageFile, validateAttachmentFile } from '../lib/imageUtils';
import { useBackButton } from '../lib/backButtonHandler';
import L from 'leaflet';
import { LocationAutocomplete } from './LocationAutocomplete';
import { searchLocationsOnline, reverseGeocodeOnline } from '../lib/apiUtils';

type MapTileStyle = 'voyager' | 'positron' | 'streets' | 'osm' | 'satellite' | 'terrain' | 'dark';

const PICKER_TILE_LAYERS: Record<
  MapTileStyle,
  { name: string; url: string; attribution: string }
> = {
  voyager: {
    name: 'Voyager Travel',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CartoDB &copy; OpenStreetMap',
  },
  positron: {
    name: 'Minimal Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CartoDB &copy; OpenStreetMap',
  },
  streets: {
    name: 'Esri Streets',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
  },
  osm: {
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    name: 'Satellite Aerial',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri World Imagery',
  },
  terrain: {
    name: 'Topo Elevation',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap',
  },
  dark: {
    name: 'Dark Canvas',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CartoDB &copy; OpenStreetMap',
  },
};

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
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [activeTileStyle, setActiveTileStyle] = useState<MapTileStyle>('voyager');
  const [showStylePicker, setShowStylePicker] = useState(false);

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
      try {
        map.off();
        map.stop();
        map.remove();
      } catch (e) {
        // ignore
      }
      if (container) delete (container as any)._leaflet_map;
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (tileLayerRef.current) {
      try {
        mapInstanceRef.current.removeLayer(tileLayerRef.current);
      } catch (e) {
        // ignore
      }
    }
    const tileInfo = PICKER_TILE_LAYERS[activeTileStyle] || PICKER_TILE_LAYERS.voyager;
    tileLayerRef.current = L.tileLayer(tileInfo.url, {
      maxZoom: 20,
      attribution: tileInfo.attribution,
    }).addTo(mapInstanceRef.current);
  }, [activeTileStyle]);

  useEffect(() => {
    if (flyToTrigger && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([flyToTrigger.lat, flyToTrigger.lng], 16, { animate: true, duration: 0.35 });
    }
  }, [flyToTrigger]);

  return (
    <div className="relative h-full w-full">
      <div ref={modalMapRef} className="h-full w-full z-10" />

      {/* Floating Zoom & Layers Controls */}
      <div className="absolute bottom-44 right-4 z-30 flex flex-col items-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-1 shadow-2xl space-y-1">
        <button
          type="button"
          onClick={() => mapInstanceRef.current?.zoomIn()}
          className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95 cursor-pointer"
          title="Zoom In"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => mapInstanceRef.current?.zoomOut()}
          className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95 cursor-pointer"
          title="Zoom Out"
        >
          <Minus className="h-4 w-4" />
        </button>

        <div className="w-5 h-px bg-slate-200 dark:bg-slate-800 my-0.5" />

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowStylePicker(!showStylePicker)}
            className="h-8 w-8 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition active:scale-95 cursor-pointer"
            title="Map Tile Style"
          >
            <Layers className="h-4 w-4" />
          </button>

          {showStylePicker && (
            <div className="absolute right-10 bottom-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-2xl p-2 w-44 shadow-2xl z-40 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 text-slate-400">
                Map Style
              </div>
              {Object.entries(PICKER_TILE_LAYERS).map(([key, style]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setActiveTileStyle(key as MapTileStyle);
                    setShowStylePicker(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                    activeTileStyle === key
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{style.name}</span>
                  {activeTileStyle === key && <span className="text-xs">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface AddPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTrip: Trip;
  editingPlace?: Place | null;
  initialDate?: string;
  onSavePlan: (placesToAdd: Place[], editingPlaceId?: string) => void;
  isReadOnly?: boolean;
}

const getDatePart = (dtStr: string) => {
  if (!dtStr) return '';
  if (dtStr.includes('T')) return dtStr.split('T')[0];
  return dtStr.slice(0, 10);
};

const getTimePart = (dtStr: string) => {
  if (!dtStr) return '12:00';
  if (dtStr.includes('T')) return dtStr.split('T')[1]?.slice(0, 5) || '12:00';
  return '12:00';
};

export const AddPlanModal: React.FC<AddPlanModalProps> = ({
  isOpen,
  onClose,
  activeTrip,
  editingPlace,
  initialDate,
  onSavePlan,
  isReadOnly,
}) => {
  const [planTab, setPlanTab] = useState<'plan' | 'transport' | 'stay'>('plan');

  // Plan fields
  const [planTitle, setPlanTitle] = useState('');
  const [planTime, setPlanTime] = useState('');
  const [planAddress, setPlanAddress] = useState('');
  const [planDesc, setPlanDesc] = useState('');
  const [planLat, setPlanLat] = useState<number>(0);
  const [planLng, setPlanLng] = useState<number>(0);

  // Transport fields
  const [transportType, setTransportType] = useState('Flight');
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [fromLat, setFromLat] = useState<number>(0);
  const [fromLng, setFromLng] = useState<number>(0);
  const [toLat, setToLat] = useState<number>(0);
  const [toLng, setToLng] = useState<number>(0);
  const [departureTime, setDepartureTime] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [bookingRef, setBookingRef] = useState('');
  const [seatNum, setSeatNum] = useState('');

  // Stay fields
  const [hotelName, setHotelName] = useState('');
  const [hotelAddress, setHotelAddress] = useState('');
  const [hotelLat, setHotelLat] = useState<number>(0);
  const [hotelLng, setHotelLng] = useState<number>(0);
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [confirmationNum, setConfirmationNum] = useState('');
  const [stayDesc, setStayDesc] = useState('');

  // File attachment
  const [stopAttachmentName, setStopAttachmentName] = useState('');
  const [stopAttachmentData, setStopAttachmentData] = useState('');

  // Validation state
  const [validationError, setValidationError] = useState<string | null>(null);

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

  // Back button handler for map picker (priority 110) and main modal (priority 100)
  useBackButton('add-plan-map-picker', activeMapPickerTarget !== null, () => setActiveMapPickerTarget(null), 110);
  useBackButton('add-plan-modal', isOpen && activeMapPickerTarget === null, onClose, 100);

  // Date Bounds
  const minDateTime = activeTrip.startDate ? `${activeTrip.startDate}T00:00` : undefined;
  const maxDateTime = activeTrip.endDate ? `${activeTrip.endDate}T23:59` : undefined;

  useEffect(() => {
    if (!isOpen) return;

    const defaultDate = initialDate || activeTrip.startDate || new Date().toISOString().split('T')[0];

    if (editingPlace) {
      if (editingPlace.isStay) {
        setPlanTab('stay');
        setHotelName(editingPlace.hotelName || editingPlace.title.replace(/^Check (in|out) at /i, '') || '');
        setHotelAddress(editingPlace.stayAddress || editingPlace.address || '');
        setHotelLat(editingPlace.stayLat || editingPlace.lat || 0);
        setHotelLng(editingPlace.stayLng || editingPlace.lng || 0);

        const baseStem = editingPlace.id ? editingPlace.id.replace(/-in$|-out$/, '') : '';
        const inEntry = (activeTrip.timeline || []).find(
          (p) => p.id === `${baseStem}-in` || (p.isStay && p.title.toLowerCase().includes('check in'))
        );
        const outEntry = (activeTrip.timeline || []).find(
          (p) => p.id === `${baseStem}-out` || (p.isStay && p.title.toLowerCase().includes('check out'))
        );
        const isCheckOutCard = editingPlace.id?.endsWith('-out') || editingPlace.title.toLowerCase().startsWith('check out');

        const resolvedInTime =
          editingPlace.checkInTime ||
          inEntry?.checkInTime ||
          inEntry?.time ||
          (!isCheckOutCard ? editingPlace.time : '') ||
          '';

        const resolvedOutTime =
          editingPlace.checkOutTime ||
          outEntry?.checkOutTime ||
          outEntry?.time ||
          (isCheckOutCard ? editingPlace.time : '') ||
          '';

        setCheckInTime(resolvedInTime);
        setCheckOutTime(resolvedOutTime);
        setConfirmationNum(editingPlace.confirmationNum || inEntry?.confirmationNum || outEntry?.confirmationNum || '');
        setStayDesc(editingPlace.stayDesc || editingPlace.description || '');
        setStopAttachmentName(editingPlace.stayAttachment || editingPlace.attachmentName || '');
        setStopAttachmentData(editingPlace.stayAttachmentData || editingPlace.attachmentData || '');
      } else if (editingPlace.isTransport) {
        setPlanTab('transport');
        setPlanTitle(editingPlace.title || '');
        setTransportType(editingPlace.transportType || 'Flight');
        setFromLocation(editingPlace.fromLocation || '');
        setToLocation(editingPlace.toLocation || '');
        setFromLat(editingPlace.fromLat || editingPlace.lat || 0);
        setFromLng(editingPlace.fromLng || editingPlace.lng || 0);
        setToLat(editingPlace.toLat || 0);
        setToLng(editingPlace.toLng || 0);
        setDepartureTime(editingPlace.departureTime || editingPlace.time || '');
        setArrivalTime(editingPlace.arrivalTime || '');
        setBookingRef(editingPlace.bookingRef || '');
        setSeatNum(editingPlace.seatNum || '');
        setStopAttachmentName(editingPlace.attachmentName || '');
        setStopAttachmentData(editingPlace.attachmentData || '');
      } else {
        setPlanTab('plan');
        setPlanTitle(editingPlace.title || '');
        setPlanTime(editingPlace.time || '');
        setPlanAddress(editingPlace.address || '');
        setPlanDesc(editingPlace.description || '');
        setPlanLat(editingPlace.lat || 0);
        setPlanLng(editingPlace.lng || 0);
        setStopAttachmentName(editingPlace.attachmentName || '');
        setStopAttachmentData(editingPlace.attachmentData || '');
      }
    } else {
      setPlanTab('plan');
      setPlanTitle('');
      setPlanTime(`${defaultDate}T10:00`);
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
      setSeatNum('');

      setHotelName('');
      setHotelAddress('');
      setHotelLat(0);
      setHotelLng(0);
      setCheckInTime(`${defaultDate}T14:00`);

      // Compute checkout default bounded by activeTrip.endDate
      const nextDay = new Date(defaultDate + 'T00:00:00');
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = nextDay.toISOString().split('T')[0];
      const checkOutDateStr = (activeTrip.endDate && nextDayStr > activeTrip.endDate) ? activeTrip.endDate : nextDayStr;
      setCheckOutTime(`${checkOutDateStr}T11:00`);

      setConfirmationNum('');
      setStayDesc('');

      setStopAttachmentName('');
      setStopAttachmentData('');
    }
  }, [
    isOpen,
    editingPlace?.id,
    initialDate,
    activeTrip?.id,
    activeTrip?.startDate,
    activeTrip?.endDate,
  ]);

  if (!isOpen) return null;

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

    if (initialLat === 48.8566 && activeTrip.timeline?.length) {
      const itemWithCoords = activeTrip.timeline.find((item) => item.lat && item.lng);
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
      const rawLoc = pickerSelectedAddress || `${pickerSelectedLat.toFixed(4)}, ${pickerSelectedLng.toFixed(4)}`;
      const cleanLoc = rawLoc.split(',')[0].trim();
      setFromLocation(cleanLoc);
    } else if (activeMapPickerTarget === 'to') {
      setToLat(pickerSelectedLat);
      setToLng(pickerSelectedLng);
      const rawLoc = pickerSelectedAddress || `${pickerSelectedLat.toFixed(4)}, ${pickerSelectedLng.toFixed(4)}`;
      const cleanLoc = rawLoc.split(',')[0].trim();
      setToLocation(cleanLoc);
    } else if (activeMapPickerTarget === 'stay') {
      setHotelLat(pickerSelectedLat);
      setHotelLng(pickerSelectedLng);
      setHotelAddress(pickerSelectedAddress || `${pickerSelectedLat.toFixed(4)}, ${pickerSelectedLng.toFixed(4)}`);
    }

    setActiveMapPickerTarget(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const val = validateAttachmentFile(file);
    if (!val.valid) {
      setValidationError(val.error || 'Invalid file.');
      return;
    }
    setValidationError(null);
    try {
      const compressed = await compressImageFile(file);
      setStopAttachmentName(compressed.name);
      setStopAttachmentData(compressed.data);
    } catch (err) {
      console.error('Error compressing file:', err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    setValidationError(null);

    const placesToAdd: Place[] = [];

    if (planTab === 'plan') {
      if (!planTitle.trim()) return;
      placesToAdd.push({
        id: editingPlace ? editingPlace.id : `place-${Date.now()}`,
        title: planTitle.trim(),
        time: planTime || (activeTrip.startDate ? `${activeTrip.startDate}T10:00` : ''),
        address: planAddress.trim(),
        description: planDesc.trim(),
        attachmentName: stopAttachmentName || undefined,
        attachmentData: stopAttachmentData || undefined,
        lat: planLat || 0,
        lng: planLng || 0,
      });
    } else if (planTab === 'transport') {
      if (!fromLocation.trim() || !toLocation.trim()) return;
      const cleanFrom = fromLocation.trim().split(',')[0].trim();
      const cleanTo = toLocation.trim().split(',')[0].trim();
      const defaultTitle = `${transportType}: ${cleanFrom} to ${cleanTo}`;
      const title = planTitle.trim() || defaultTitle;
      const effectiveDepartureTime = departureTime || planTime || (activeTrip.startDate ? `${activeTrip.startDate}T09:00` : '');

      if (effectiveDepartureTime && arrivalTime) {
        const depT = new Date(effectiveDepartureTime).getTime();
        const arrT = new Date(arrivalTime).getTime();
        if (!isNaN(depT) && !isNaN(arrT) && arrT <= depT) {
          setValidationError('Arrival time must be after departure time.');
          return;
        }
      }

      placesToAdd.push({
        id: editingPlace ? editingPlace.id : `place-${Date.now()}`,
        title,
        description: `Transportation from ${cleanFrom} to ${cleanTo}`,
        address: cleanFrom,
        time: effectiveDepartureTime,
        from: cleanFrom,
        to: cleanTo,
        fromLocation: cleanFrom,
        toLocation: cleanTo,
        transportType,
        boardingTime: effectiveDepartureTime,
        departureTime: effectiveDepartureTime,
        arrivalTime,
        bookingRef,
        seatNum,
        isTransport: true,
        isTransportation: true,
        attachmentName: stopAttachmentName || undefined,
        attachmentData: stopAttachmentData || undefined,
        lat: fromLat || 0,
        lng: fromLng || 0,
        fromLat: fromLat || 0,
        fromLng: fromLng || 0,
        toLat: toLat || 0,
        toLng: toLng || 0,
      });
    } else {
      // Stay
      const name = hotelName.trim() || 'Accommodation';
      const baseStem = editingPlace ? editingPlace.id.replace(/-in$|-out$/, '') : `place-${Date.now()}`;

      if (checkInTime && checkOutTime) {
        const inT = new Date(checkInTime).getTime();
        const outT = new Date(checkOutTime).getTime();
        if (!isNaN(inT) && !isNaN(outT) && outT <= inT) {
          setValidationError('Check-out time must be after check-in time.');
          return;
        }
      }

      const checkInPlace: Place = {
        id: `${baseStem}-in`,
        title: `Check in at ${name}`,
        description: stayDesc,
        time: checkInTime || (activeTrip.startDate ? `${activeTrip.startDate}T14:00` : ''),
        lat: hotelLat || 0,
        lng: hotelLng || 0,
        address: hotelAddress,
        isStay: true,
        hotelName: name,
        checkInTime,
        checkOutTime,
        stayAddress: hotelAddress,
        stayLat: hotelLat || 0,
        stayLng: hotelLng || 0,
        stayAttachment: stopAttachmentName || undefined,
        stayAttachmentData: stopAttachmentData || undefined,
        stayDesc,
        confirmationNum,
      };

      placesToAdd.push(checkInPlace);

      if (checkOutTime) {
        placesToAdd.push({
          ...checkInPlace,
          id: `${baseStem}-out`,
          title: `Check out at ${name}`,
          time: checkOutTime,
        });
      }
    }

    onSavePlan(placesToAdd, editingPlace?.id);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-y-auto flex justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-[28px] sm:rounded-[32px] shadow-2xl p-4 sm:p-6 w-full max-w-2xl max-h-[92vh] overflow-y-auto text-left relative animate-in fade-in zoom-in-95 duration-200 my-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 p-1 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-350 border border-slate-200/50 dark:border-slate-800 transition cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center space-x-2">
          <Calendar className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <span>{editingPlace ? `Edit Plan: ${planTitle.trim() || editingPlace.title}` : 'Add Plan to Itinerary'}</span>
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Plan activities, transportation bookings, or accommodations for your trip itinerary.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 mt-5">

          {/* 3 Tabs Selection Bar */}
          <div className="flex items-center space-x-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl w-full">
            <button
              type="button"
              onClick={() => setPlanTab('plan')}
              className={`flex-1 w-1/3 py-2 px-3 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                planTab === 'plan'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Plan
            </button>
            <button
              type="button"
              onClick={() => setPlanTab('transport')}
              className={`flex-1 w-1/3 py-2 px-3 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                planTab === 'transport'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Transport
            </button>
            <button
              type="button"
              onClick={() => setPlanTab('stay')}
              className={`flex-1 w-1/3 py-2 px-3 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                planTab === 'stay'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Stay
            </button>
          </div>

          {/* Tab 1: PLAN */}
          {planTab === 'plan' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 min-w-0">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Title / Activity *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Louvre Museum Visit"
                    value={planTitle}
                    onChange={(e) => setPlanTitle(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-medium"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Date & Time</label>
                  <div className="flex items-center gap-1.5 w-full min-w-0">
                    <input
                      type="date"
                      min={activeTrip.startDate}
                      max={activeTrip.endDate}
                      value={getDatePart(planTime)}
                      onChange={(e) => {
                        const time = getTimePart(planTime);
                        setPlanTime(e.target.value ? `${e.target.value}T${time}` : '');
                      }}
                      className="flex-1 min-w-0 text-xs px-2.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-medium cursor-pointer"
                    />
                    <input
                      type="time"
                      value={getTimePart(planTime)}
                      onChange={(e) => {
                        const date = getDatePart(planTime) || (activeTrip.startDate || new Date().toISOString().slice(0, 10));
                        setPlanTime(`${date}T${e.target.value || '12:00'}`);
                      }}
                      className="w-24 sm:w-28 shrink-0 min-w-0 text-xs px-2 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-medium text-center cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1 min-w-0">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Address Location</label>
                  <button
                    type="button"
                    onClick={() => handleOpenMapPicker('stop')}
                    className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center space-x-0.5 cursor-pointer"
                  >
                    <MapPin className="h-3 w-3" />
                    <span>Select on Map</span>
                  </button>
                </div>
                <LocationAutocomplete
                  placeholder="e.g. Rue de Rivoli, 75001 Paris"
                  value={planAddress}
                  onChange={(val, lat, lng) => {
                    setPlanAddress(val);
                    if (lat && lng) {
                      setPlanLat(lat);
                      setPlanLng(lng);
                    }
                  }}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500 font-medium"
                />
              </div>

              <div className="space-y-1 min-w-0">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Notes / Details</label>
                <textarea
                  rows={2}
                  placeholder="Additional notes, ticket numbers, or guidelines..."
                  value={planDesc}
                  onChange={(e) => setPlanDesc(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-medium"
                />
              </div>
            </div>
          )}

          {/* Tab 2: TRANSPORT */}
          {planTab === 'transport' && (
            <div className="space-y-3">
              <div className="space-y-1 min-w-0">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Title / Connection Name</label>
                <input
                  type="text"
                  placeholder={
                    fromLocation && toLocation
                      ? `${transportType}: ${fromLocation.split(',')[0].trim()} to ${toLocation.split(',')[0].trim()}`
                      : "e.g. Morning Flight to Singapore"
                  }
                  value={planTitle}
                  onChange={(e) => setPlanTitle(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500 font-medium"
                />
              </div>

              <div className="space-y-1 min-w-0">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Mode of Transport</label>
                <div className="grid grid-cols-5 gap-2">
                  {['Flight', 'Train', 'Bus', 'Car', 'Ferry'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setTransportType(type)}
                      className={`py-2 px-1 rounded-xl text-xs font-bold border transition text-center cursor-pointer flex flex-col items-center justify-center space-y-1 ${
                        transportType === type
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500'
                      }`}
                    >
                      {type === 'Flight' && <Plane className="h-3.5 w-3.5" />}
                      {type === 'Train' && <Train className="h-3.5 w-3.5" />}
                      {type === 'Bus' && <Bus className="h-3.5 w-3.5" />}
                      {type === 'Car' && <Car className="h-3.5 w-3.5" />}
                      {type === 'Ferry' && <Building2 className="h-3.5 w-3.5" />}
                      <span className="text-[10px]">{type}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">From Location *</label>
                    <button
                      type="button"
                      onClick={() => handleOpenMapPicker('from')}
                      className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center space-x-0.5 cursor-pointer"
                    >
                      <MapPin className="h-3 w-3" />
                      <span>Select on Map</span>
                    </button>
                  </div>
                  <LocationAutocomplete
                    required
                    filterType={transportType === 'Flight' ? 'airport' : 'all'}
                    placeholder={transportType === 'Flight' ? "e.g. JFK or John F Kennedy Airport" : "e.g. Central Station / City"}
                    value={fromLocation}
                    onChange={(val, lat, lng) => {
                      setFromLocation(val);
                      if (lat && lng) {
                        setFromLat(lat);
                        setFromLng(lng);
                      }
                    }}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none font-medium text-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="space-y-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">To Location *</label>
                    <button
                      type="button"
                      onClick={() => handleOpenMapPicker('to')}
                      className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center space-x-0.5 cursor-pointer"
                    >
                      <MapPin className="h-3 w-3" />
                      <span>Select on Map</span>
                    </button>
                  </div>
                  <LocationAutocomplete
                    required
                    filterType={transportType === 'Flight' ? 'airport' : 'all'}
                    placeholder={transportType === 'Flight' ? "e.g. LHR or London Heathrow Airport" : "e.g. Central Station / City"}
                    value={toLocation}
                    onChange={(val, lat, lng) => {
                      setToLocation(val);
                      if (lat && lng) {
                        setToLat(lat);
                        setToLng(lng);
                      }
                    }}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none font-medium text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 min-w-0">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Departure Time</label>
                  <div className="flex items-center gap-1.5 w-full min-w-0">
                    <input
                      type="date"
                      min={activeTrip.startDate}
                      max={activeTrip.endDate}
                      value={getDatePart(departureTime)}
                      onChange={(e) => {
                        const time = getTimePart(departureTime);
                        setDepartureTime(e.target.value ? `${e.target.value}T${time}` : '');
                      }}
                      className="flex-1 min-w-0 text-xs px-2.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none font-medium text-slate-800 dark:text-slate-100 cursor-pointer"
                    />
                    <input
                      type="time"
                      value={getTimePart(departureTime)}
                      onChange={(e) => {
                        const date = getDatePart(departureTime) || (activeTrip.startDate || new Date().toISOString().slice(0, 10));
                        setDepartureTime(`${date}T${e.target.value || '12:00'}`);
                      }}
                      className="w-24 sm:w-28 shrink-0 min-w-0 text-xs px-2 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none font-medium text-slate-800 dark:text-slate-100 text-center cursor-pointer"
                    />
                  </div>
                </div>
                <div className="space-y-1 min-w-0">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Arrival Time</label>
                  <div className="flex items-center gap-1.5 w-full min-w-0">
                    <input
                      type="date"
                      min={getDatePart(departureTime) || activeTrip.startDate}
                      max={activeTrip.endDate}
                      value={getDatePart(arrivalTime)}
                      onChange={(e) => {
                        const time = getTimePart(arrivalTime);
                        setArrivalTime(e.target.value ? `${e.target.value}T${time}` : '');
                      }}
                      className="flex-1 min-w-0 text-xs px-2.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none font-medium text-slate-800 dark:text-slate-100 cursor-pointer"
                    />
                    <input
                      type="time"
                      value={getTimePart(arrivalTime)}
                      onChange={(e) => {
                        const date = getDatePart(arrivalTime) || getDatePart(departureTime) || (activeTrip.startDate || new Date().toISOString().slice(0, 10));
                        setArrivalTime(`${date}T${e.target.value || '12:00'}`);
                      }}
                      className="w-24 sm:w-28 shrink-0 min-w-0 text-xs px-2 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none font-medium text-slate-800 dark:text-slate-100 text-center cursor-pointer"
                    />
                  </div>
                  {departureTime && arrivalTime && new Date(arrivalTime).getTime() <= new Date(departureTime).getTime() && (
                    <p className="text-[10px] text-rose-500 font-semibold mt-1">Arrival time must be after departure time</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 min-w-0">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Booking Reference</label>
                  <input
                    type="text"
                    placeholder="PNR / Ticket Code"
                    value={bookingRef}
                    onChange={(e) => setBookingRef(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono uppercase"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Seat / Coach</label>
                  <input
                    type="text"
                    placeholder="e.g. 14B"
                    value={seatNum}
                    onChange={(e) => setSeatNum(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono uppercase"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: STAY */}
          {planTab === 'stay' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 min-w-0">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Hotel / Stay Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Grand Hyatt Paris"
                    value={hotelName}
                    onChange={(e) => setHotelName(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none font-medium"
                  />
                </div>

                <div className="space-y-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Hotel Address / Location</label>
                    <button
                      type="button"
                      onClick={() => handleOpenMapPicker('stay')}
                      className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center space-x-0.5 cursor-pointer"
                    >
                      <MapPin className="h-3 w-3" />
                      <span>Select on Map</span>
                    </button>
                  </div>
                  <LocationAutocomplete
                    placeholder="e.g. 6-10-3 Roppongi, Minato City"
                    value={hotelAddress}
                    onChange={(val, lat, lng) => {
                      setHotelAddress(val);
                      if (lat && lng) {
                        setHotelLat(lat);
                        setHotelLng(lng);
                      }
                    }}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none font-medium text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 min-w-0">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Check-in Time *</label>
                  <div className="flex items-center gap-1.5 w-full min-w-0">
                    <input
                      type="date"
                      required
                      min={activeTrip.startDate}
                      max={activeTrip.endDate}
                      value={getDatePart(checkInTime)}
                      onChange={(e) => {
                        const time = getTimePart(checkInTime);
                        setCheckInTime(e.target.value ? `${e.target.value}T${time}` : '');
                      }}
                      className="flex-1 min-w-0 text-xs px-2.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none font-medium text-slate-800 dark:text-slate-100 cursor-pointer"
                    />
                    <input
                      type="time"
                      required
                      value={getTimePart(checkInTime)}
                      onChange={(e) => {
                        const date = getDatePart(checkInTime) || (activeTrip.startDate || new Date().toISOString().slice(0, 10));
                        setCheckInTime(`${date}T${e.target.value || '12:00'}`);
                      }}
                      className="w-24 sm:w-28 shrink-0 min-w-0 text-xs px-2 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none font-medium text-slate-800 dark:text-slate-100 text-center cursor-pointer"
                    />
                  </div>
                </div>

                <div className="space-y-1 min-w-0">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Check-out Time</label>
                  <div className="flex items-center gap-1.5 w-full min-w-0">
                    <input
                      type="date"
                      min={getDatePart(checkInTime) || activeTrip.startDate}
                      max={activeTrip.endDate}
                      value={getDatePart(checkOutTime)}
                      onChange={(e) => {
                        const time = getTimePart(checkOutTime);
                        setCheckOutTime(e.target.value ? `${e.target.value}T${time}` : '');
                      }}
                      className="flex-1 min-w-0 text-xs px-2.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none font-medium text-slate-800 dark:text-slate-100 cursor-pointer"
                    />
                    <input
                      type="time"
                      value={getTimePart(checkOutTime)}
                      onChange={(e) => {
                        const date = getDatePart(checkOutTime) || getDatePart(checkInTime) || (activeTrip.startDate || new Date().toISOString().slice(0, 10));
                        setCheckOutTime(`${date}T${e.target.value || '12:00'}`);
                      }}
                      className="w-24 sm:w-28 shrink-0 min-w-0 text-xs px-2 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none font-medium text-slate-800 dark:text-slate-100 text-center cursor-pointer"
                    />
                  </div>
                  {checkInTime && checkOutTime && new Date(checkOutTime).getTime() <= new Date(checkInTime).getTime() && (
                    <p className="text-[10px] text-rose-500 font-semibold mt-1">Check-out time must be after check-in time</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Confirmation Code</label>
                  <input
                    type="text"
                    placeholder="e.g. CONF-88912"
                    value={confirmationNum}
                    onChange={(e) => setConfirmationNum(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono uppercase"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Stay Instructions</label>
                  <input
                    type="text"
                    placeholder="Key code, room number, etc."
                    value={stayDesc}
                    onChange={(e) => setStayDesc(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-medium"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {validationError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Attachment Upload */}
          <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
            <label className="text-[10px] font-bold text-slate-500 uppercase">Attachment / Ticket PDF</label>
            <div className="flex flex-col items-start gap-2">
              <label className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold transition cursor-pointer">
                <Upload className="h-3.5 w-3.5" />
                <span>Upload File</span>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                  accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                />
              </label>
              {stopAttachmentName && (
                <div className="flex items-center justify-between w-full max-w-full bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 min-w-0">
                  <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium truncate min-w-0 pr-2">
                    {stopAttachmentName}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setStopAttachmentName('');
                      setStopAttachmentData('');
                    }}
                    title="Remove attachment"
                    className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md transition cursor-pointer shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
              Supported file types: JPG, JPEG, PNG, PDF (Max size: 500KB)
            </p>
          </div>

          <div className="pt-3 flex items-center justify-end space-x-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 text-xs font-bold hover:bg-slate-100 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              {editingPlace ? 'Save Changes' : 'Add to Itinerary'}
            </button>
          </div>
        </form>
      </div>

      {/* Map Picker Modal Overlay */}
      {activeMapPickerTarget &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col w-screen h-screen overflow-hidden">
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

              <div className="absolute top-4 left-3 right-16 md:right-auto md:w-[420px] z-30">
                <div className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-full shadow-2xl flex items-center pl-3.5 pr-1.5 py-1.5 transition-all focus-within:ring-2 focus-within:ring-indigo-500/50">
                  <Search className="h-4 w-4 text-indigo-600 dark:text-indigo-400 mr-2 shrink-0" />
                  <input
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Enter location or landmark name..."
                    value={pickerSearchQuery}
                    onChange={(e) => handlePickerSearch(e.target.value)}
                    className="min-w-0 flex-1 w-full text-xs bg-transparent outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 font-medium"
                  />
                  {pickerSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setPickerSearchQuery('');
                        setPickerSuggestions([]);
                      }}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 mr-1 p-0.5 cursor-pointer shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handlePickerSearch(pickerSearchQuery)}
                    disabled={!pickerSearchQuery.trim()}
                    className="px-3.5 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white rounded-full transition flex items-center space-x-1 cursor-pointer shrink-0 disabled:cursor-not-allowed shadow-2xs"
                  >
                    <span>Search</span>
                  </button>
                </div>

                {pickerSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 z-50">
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
                        className="p-3 text-xs text-slate-750 dark:text-slate-300 hover:bg-slate-50 cursor-pointer flex items-center space-x-2.5 transition"
                      >
                        <span className="text-indigo-500 text-sm">📍</span>
                        <span className="truncate font-medium">{s.display_name || s.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="absolute top-4 right-4 z-30">
                <button
                  type="button"
                  onClick={() => setActiveMapPickerTarget(null)}
                  className="h-10 w-10 rounded-full bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-800 flex items-center justify-center transition-all shadow-xl hover:scale-105 active:scale-95 cursor-pointer"
                  title="Close map"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(100%-4px)] z-20 pointer-events-none flex flex-col items-center">
                <div className="bg-indigo-600 text-white p-2.5 rounded-full shadow-2xl border-2 border-white flex items-center justify-center animate-bounce">
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="w-2.5 h-2.5 bg-indigo-900/60 rounded-full border border-white mt-1 shadow-md animate-pulse"></div>
              </div>

              {isPickerGeocoding && (
                <div className="absolute top-18 left-4 z-30 bg-slate-900/90 text-white px-3.5 py-1.5 rounded-full text-[10px] font-bold flex items-center space-x-2 shadow-lg">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span>
                  <span>Fetching address details...</span>
                </div>
              )}

              {/* Bottom Floating Panel */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 w-[92vw] max-w-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-800/90 flex flex-col gap-3">
                {/* Line 1: Complete location address & coordinates */}
                <div className="flex items-start space-x-2.5 min-w-0">
                  <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-lg shrink-0 mt-0.5">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug break-words">
                      {pickerSelectedAddress || 'Selected location on map'}
                    </p>
                    <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
                      {pickerSelectedLat.toFixed(6)}, {pickerSelectedLng.toFixed(6)}
                    </p>
                  </div>
                </div>

                {/* Line 2: Cancel and Confirm buttons below */}
                <div className="flex items-center justify-end space-x-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveMapPickerTarget(null)}
                    className="px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmPickerSelection}
                    className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-xl text-xs transition shadow-md shadow-indigo-600/20 cursor-pointer text-center"
                  >
                    Confirm Location
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>,
    document.body
  );
};

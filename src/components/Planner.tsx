import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Calendar,
  MapPin,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Map,
  Navigation,
  Users,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  DollarSign,
  FileText,
  Upload,
  Download,
  Plane,
  Train,
  Bus,
  Info,
  ChevronDown,
  ChevronUp,
  Search,
  Loader2,
  Maximize2,
  Minimize2,
  Building,
  Route,
  Play,
  Sparkles,
  Minus,
  Layers,
  Compass,
  AlertTriangle,
  AlertCircle,
  Eye,
} from "lucide-react";
import { Trip, Place, Expense, AttachmentItem } from "../types";
import { compressImageFile, validateAttachmentFile, getItemAttachments } from "../lib/imageUtils";
import { AddPlanModal } from "./AddPlanModal";
import { GeminiItineraryModal } from "./GeminiItineraryModal";
import { AttachmentViewerModal } from "./AttachmentViewerModal";
import { AttachmentManager } from "./AttachmentManager";
import { LocationAutocomplete } from "./LocationAutocomplete";
import L from "leaflet";
import { SUGGESTED_LOCATIONS } from "../data/suggestedLocations";
import { reconcileDailyHotelStops } from "../lib/hotelStopsUtils";
import emptyTripsImage from "../assets/images/no_plans.png";
import AdBanner from "./AdBanner";
import { getSetupExchangeRate } from "../lib/tripUtils";
import { useBackButton } from "../lib/backButtonHandler";
import { downloadOrShareBase64 } from "../lib/nativeShareDownload";
import { searchLocationsOnline, reverseGeocodeOnline } from "../lib/apiUtils";

interface PlannerProps {
  trips: { [id: string]: Trip };
  onUpdateTrips: (updatedTrips: { [id: string]: Trip }) => void;
  activeTripId: string | null;
  onSetActiveTripId: (id: string | null) => void;
  isReadOnly?: boolean;
  onOpenMap?: (placeId?: string) => void;
  onOpenUpgradeModal?: () => void;
  user?: any;
  isGuest?: boolean;
}

type MapTileStyle = "voyager" | "positron" | "streets" | "osm" | "satellite" | "terrain" | "dark";

const PICKER_TILE_LAYERS: Record<
  MapTileStyle,
  { name: string; url: string; attribution: string }
> = {
  voyager: {
    name: "Voyager Travel",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: "&copy; CartoDB &copy; OpenStreetMap",
  },
  positron: {
    name: "Minimal Light",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; CartoDB &copy; OpenStreetMap",
  },
  streets: {
    name: "Esri Streets",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "&copy; Esri",
  },
  osm: {
    name: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
  },
  satellite: {
    name: "Satellite Aerial",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "&copy; Esri World Imagery",
  },
  terrain: {
    name: "Topo Elevation",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenTopoMap",
  },
  dark: {
    name: "Dark Canvas",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; CartoDB &copy; OpenStreetMap",
  },
};

interface ModalPickerMapProps {
  pickerSelectedLat: number;
  pickerSelectedLng: number;
  setPickerSelectedLat: (lat: number) => void;
  setPickerSelectedLng: (lng: number) => void;
  setPickerSelectedAddress: (address: string) => void;
  setIsPickerGeocoding: (geocoding: boolean) => void;
  isMapFullscreen: boolean;
  flyToTrigger: { lat: number; lng: number; time: number } | null;
}

const ModalPickerMap = ({
  pickerSelectedLat,
  pickerSelectedLng,
  setPickerSelectedLat,
  setPickerSelectedLng,
  setPickerSelectedAddress,
  setIsPickerGeocoding,
  isMapFullscreen,
  flyToTrigger,
}: ModalPickerMapProps) => {
  const modalMapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [activeTileStyle, setActiveTileStyle] = useState<MapTileStyle>("voyager");
  const [showStylePicker, setShowStylePicker] = useState(false);

  useEffect(() => {
    if (!modalMapRef.current) return;

    let isInitialMapLoad = true;
    const container = modalMapRef.current;
    if ((container as any)._leaflet_map) {
      try {
        (container as any)._leaflet_map.remove();
      } catch (e) {
        console.warn("Error removing existing map:", e);
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

    // On moveend, reverse-geocode the address for the center coordinates and update coordinates
    map.on("moveend", () => {
      if (isInitialMapLoad) {
        isInitialMapLoad = false;
        return;
      }
      const center = map.getCenter();
      const lat = Number(center.lat.toFixed(6));
      const lng = Number(center.lng.toFixed(6));

      setPickerSelectedLat(lat);
      setPickerSelectedLng(lng);

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      setIsPickerGeocoding(true);
      debounceTimer = setTimeout(async () => {
        try {
          const address = await reverseGeocodeOnline(lat, lng);
          setPickerSelectedAddress(
            address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          );
        } catch (e) {
          setPickerSelectedAddress(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        } finally {
          setIsPickerGeocoding(false);
        }
      }, 600); // 600ms debounce to prevent hitting rate limits
    });

    const timer = setTimeout(() => {
      if (map && (map as any)._container) {
        map.invalidateSize();
      }
    }, 250);

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      clearTimeout(timer);
      try {
        map.off();
        map.stop();
        map.remove();
      } catch (e) {
        // ignore
      }
      if (container) {
        delete (container as any)._leaflet_map;
      }
      mapInstanceRef.current = null;
    };
  }, []); // Run once on mount

  // Update tile layer when activeTileStyle changes
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

  // Also listen to isMapFullscreen to invalidate map size
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [isMapFullscreen]);

  // Handle flying to a location from search suggestion
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
                      ? "bg-indigo-600 text-white"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
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

export default function Planner({
  trips,
  onUpdateTrips: originalOnUpdateTrips,
  activeTripId,
  onSetActiveTripId,
  isReadOnly,
  onOpenMap,
  onOpenUpgradeModal = () => {},
  user,
  isGuest,
}: PlannerProps) {
  const isGuestUser = isGuest ?? (
    !user?.email || 
    Boolean(user?.uid && String(user.uid).startsWith('guest_')) || 
    (typeof window !== 'undefined' && Boolean(localStorage.getItem('nomadsync_guest_user')) && !user?.email)
  );

  const onUpdateTrips = (updatedTrips: { [id: string]: Trip }) => {
    if (isReadOnly) {
      console.warn("Attempted to update a read-only trip.");
      return;
    }
    const processed: { [id: string]: Trip } = {};
    Object.keys(updatedTrips).forEach((id) => {
      const trip = updatedTrips[id];
      if (trip && trip.enableHotelDailyStops) {
        processed[id] = reconcileDailyHotelStops(trip);
      } else {
        processed[id] = trip;
      }
    });
    originalOnUpdateTrips(processed);
  };
  // Refs for focusing and scrolling
  const formRef = useRef<HTMLFormElement | null>(null);
  const placeTitleInputRef = useRef<HTMLInputElement | null>(null);
  const fromLocationInputRef = useRef<HTMLInputElement | null>(null);
  const pickerSearchTimeoutRef = useRef<any>(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (pickerSearchTimeoutRef.current) {
        clearTimeout(pickerSearchTimeoutRef.current);
      }
    };
  }, []);

  // Suggestions & Map targeting states
  const [pickingTarget, setPickingTarget] = useState<"stop" | "from" | "to">(
    "stop",
  );
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [fromSuggestions, setFromSuggestions] = useState<any[]>([]);
  const [toSuggestions, setToSuggestions] = useState<any[]>([]);
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [isLoadingFrom, setIsLoadingFrom] = useState(false);
  const [isLoadingTo, setIsLoadingTo] = useState(false);

  // Dedicated map picker modal states
  const [activeMapPickerTarget, setActiveMapPickerTarget] = useState<
    "stop" | "from" | "to" | "stay" | null
  >(null);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [pickerSearchQuery, setPickerSearchQuery] = useState("");
  const [pickerSuggestions, setPickerSuggestions] = useState<any[]>([]);
  const [isPickerSearching, setIsPickerSearching] = useState(false);
  const [hasPickerSearched, setHasPickerSearched] = useState(false);
  const [pickerSelectedLat, setPickerSelectedLat] = useState<number>(0);
  const [pickerSelectedLng, setPickerSelectedLng] = useState<number>(0);
  const [pickerSelectedAddress, setPickerSelectedAddress] = useState("");
  const [isPickerGeocoding, setIsPickerGeocoding] = useState(false);
  const [flyToTrigger, setFlyToTrigger] = useState<{
    lat: number;
    lng: number;
    time: number;
  } | null>(null);

  // Quick Expense Logging Form State
  const [loggingExpensePlaceId, setLoggingExpensePlaceId] = useState<
    string | null
  >(null);
  const [quickExpTitle, setQuickExpTitle] = useState("");
  const [quickExpAmount, setQuickExpAmount] = useState("");
  const [quickExpCurrency, setQuickExpCurrency] = useState("");
  const [quickExpPaidBy, setQuickExpPaidBy] = useState("");
  const [quickExpCategory, setQuickExpCategory] = useState("");
  const [quickExpPaymentType, setQuickExpPaymentType] = useState("");

  // Form Tab Selection: 'plan' | 'transport' | 'stay'
  const [planTab, setPlanTab] = useState<"plan" | "transport" | "stay">("plan");

  // Timeline Place form state
  const [isAddingPlace, setIsAddingPlace] = useState(false);
  const [selectedPlanDate, setSelectedPlanDate] = useState<string | undefined>(undefined);
  const [placeTitle, setPlaceTitle] = useState("");
  const [placeDesc, setPlaceDesc] = useState("");
  const [placeTime, setPlaceTime] = useState("");
  const [placeAddress, setPlaceAddress] = useState("");
  const [placeLat, setPlaceLat] = useState(0);
  const [placeLng, setPlaceLng] = useState(0);

  // Transportation details states
  const [isTransport, setIsTransport] = useState(false);
  const [transportType, setTransportType] = useState<
    "Flight" | "Train" | "Bus" | "Ferry" | "Car" | "Other"
  >("Flight");
  const [fromLocation, setFromLocation] = useState("");
  const [toLocation, setToLocation] = useState("");
  const [fromLat, setFromLat] = useState<number>(0);
  const [fromLng, setFromLng] = useState<number>(0);
  const [toLat, setToLat] = useState<number>(0);
  const [toLng, setToLng] = useState<number>(0);
  const [boardingTime, setBoardingTime] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [transportDesc, setTransportDesc] = useState("");
  const [ticketAttachmentName, setTicketAttachmentName] = useState("");
  const [ticketAttachmentData, setTicketAttachmentData] = useState("");

  // Accommodation / Stay details states
  const [isStay, setIsStay] = useState(false);
  const [hotelName, setHotelName] = useState("");
  const [checkInTime, setCheckInTime] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("");
  const [stayAddress, setStayAddress] = useState("");
  const [stayLat, setStayLat] = useState<number>(0);
  const [stayLng, setStayLng] = useState<number>(0);
  const [stayAttachmentName, setStayAttachmentName] = useState("");
  const [stayAttachmentData, setStayAttachmentData] = useState("");
  const [stayDesc, setStayDesc] = useState("");
  const [stayAddressSuggestions, setStayAddressSuggestions] = useState<any[]>(
    [],
  );

  // Multi-attachment state for stop / transport / stay
  const [placeAttachments, setPlaceAttachments] = useState<AttachmentItem[]>([]);

  // Validation state
  const [formError, setFormError] = useState<string | null>(null);

  // Lightbox Preview Image modal state
  const [previewImage, setPreviewImage] = useState<{
    src: string;
    title: string;
  } | null>(null);

  // Attachment Modal Viewer state
  const [attachmentViewer, setAttachmentViewer] = useState<{
    isOpen: boolean;
    fileName?: string;
    fileData?: string;
    attachments?: AttachmentItem[];
    initialIndex?: number;
    title?: string;
    placeId?: string;
  }>({ isOpen: false });

  // Gemini AI Itinerary Generator modal state
  const [isGeminiModalOpen, setIsGeminiModalOpen] = useState(false);
  const [showNoCountryNotice, setShowNoCountryNotice] = useState(false);

  // Apply AI-generated itinerary to the active trip timeline
  const handleApplyGeminiItinerary = (newPlaces: Place[], mode: 'replace' | 'append') => {
    if (!activeTrip || isReadOnly) return;

    let updatedTimeline: Place[] = [];
    if (mode === 'replace') {
      // Preserve existing flights, transportation, and hotel stay vouchers
      const preservedItems = (activeTrip.timeline || []).filter(
        (p) => p.isTransportation || p.isTransport || p.isStay || p.isDailyHotelStop
      );
      updatedTimeline = [...preservedItems, ...newPlaces];
    } else {
      // Append to existing timeline
      updatedTimeline = [...(activeTrip.timeline || []), ...newPlaces];
    }

    // Sort chronologically
    updatedTimeline.sort((a, b) => {
      const tA = new Date(a.time).getTime();
      const tB = new Date(b.time).getTime();
      if (isNaN(tA) || isNaN(tB)) return 0;
      return tA - tB;
    });

    onUpdateTrips({
      ...trips,
      [activeTrip.id]: {
        ...activeTrip,
        timeline: updatedTimeline,
        updatedAt: new Date().toISOString(),
      },
    });
  };

  // Remove attachment from an existing timeline place card
  const handleRemovePlaceAttachment = (
    placeId: string,
    attachmentId?: string
  ) => {
    if (isReadOnly) return;
    const updatedTimeline = (activeTrip.timeline || []).map((place) => {
      if (place.id === placeId) {
        const atts = getItemAttachments(place);
        const filtered = attachmentId ? atts.filter((a) => a.id !== attachmentId) : [];
        const first = filtered[0];
        return {
          ...place,
          attachments: filtered,
          attachment: first?.name || undefined,
          attachmentData: first?.data || undefined,
          ticketAttachment: undefined,
          ticketAttachmentData: undefined,
          stayAttachment: undefined,
          stayAttachmentData: undefined,
        };
      }
      return place;
    });
    onUpdateTrips({
      ...trips,
      [activeTrip.id]: {
        ...activeTrip,
        timeline: updatedTimeline,
      },
    });
  };

  const isImageData = (data?: string, filename?: string): boolean => {
    if (
      data &&
      (data.startsWith("data:image/") ||
        data.startsWith("blob:") ||
        data.startsWith("http://") ||
        data.startsWith("https://"))
    ) {
      return true;
    }
    if (filename) {
      if (
        filename.startsWith("data:image/") ||
        filename.startsWith("blob:") ||
        filename.startsWith("http://") ||
        filename.startsWith("https://")
      )
        return true;
      const ext = filename.toLowerCase().split(".").pop() || "";
      return [
        "jpg",
        "jpeg",
        "png",
        "gif",
        "webp",
        "svg",
        "avif",
        "bmp",
      ].includes(ext);
    }
    return false;
  };

  const getImageSrc = (data?: string, filename?: string): string | null => {
    if (
      data &&
      (data.startsWith("data:image/") ||
        data.startsWith("blob:") ||
        data.startsWith("http://") ||
        data.startsWith("https://"))
    ) {
      return data;
    }
    if (
      filename &&
      (filename.startsWith("data:image/") ||
        filename.startsWith("blob:") ||
        filename.startsWith("http://") ||
        filename.startsWith("https://"))
    ) {
      return filename;
    }
    return null;
  };

  // States for Editing, Deleting and Moving stop entries
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [deletingPlace, setDeletingPlace] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [movingPlace, setMovingPlace] = useState<Place | null>(null);
  const [targetMoveDateString, setTargetMoveDateString] = useState<string>("");

  // Modals & sub-overlays back button handlers
  useBackButton('planner-preview-image', previewImage !== null, () => setPreviewImage(null), 110);
  useBackButton('planner-attachment-viewer', attachmentViewer.isOpen, () => setAttachmentViewer(prev => ({ ...prev, isOpen: false })), 110);
  useBackButton('planner-deleting-place', deletingPlace !== null, () => setDeletingPlace(null), 110);
  useBackButton('planner-moving-place', movingPlace !== null, () => { setMovingPlace(null); setTargetMoveDateString(''); }, 110);
  useBackButton('planner-map-picker', activeMapPickerTarget !== null, () => setActiveMapPickerTarget(null), 110);

  // Collapsed/Expanded Stops tracker
  const [expandedStops, setExpandedStops] = useState<Record<string, boolean>>(
    {},
  );

  // Collapsed/Expanded Day Groups tracker (dateString: boolean)
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>(
    {},
  );

  // Timeline Search query
  const [timelineSearchQuery, setTimelineSearchQuery] = useState("");

  const toggleDayCollapsed = (dateString: string) => {
    setCollapsedDays((prev) => ({
      ...prev,
      [dateString]: !prev[dateString],
    }));
  };

  const expandAllDays = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(15);
    }
    setCollapsedDays({});
  };

  const collapseAllDays = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(15);
    }
    const days = getTimelineDays();
    const newCollapsed: Record<string, boolean> = {};
    days.forEach((d) => {
      newCollapsed[d.dateString] = true;
    });
    setCollapsedDays(newCollapsed);
  };

  const toggleStopExpanded = (stopId: string) => {
    setExpandedStops((prev) => ({
      ...prev,
      [stopId]: !prev[stopId],
    }));
  };

  // Search autocomplete helpers
  const handleAddressSearch = async (query: string) => {
    setPlaceAddress(query);
    if (query.trim().length < 2) {
      setAddressSuggestions([]);
      return;
    }
    setIsLoadingAddress(true);
    try {
      const data = await searchLocationsOnline(query, 5);
      setAddressSuggestions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingAddress(false);
    }
  };

  const findSuggestedLocation = (query: string) => {
    const clean = query.trim().toUpperCase();
    if (!clean) return null;
    return SUGGESTED_LOCATIONS.find(
      (loc) =>
        loc.code.toUpperCase() === clean ||
        loc.name.toUpperCase() === clean ||
        loc.name.toUpperCase().includes(`(${clean})`),
    );
  };

  const handleFromSearch = async (query: string) => {
    setFromLocation(query);
    const matched = findSuggestedLocation(query);
    if (matched) {
      const parsedLat = Number(matched.lat);
      const parsedLng = Number(matched.lng);
      setFromLat(parsedLat);
      setFromLng(parsedLng);
      setPlaceLat(parsedLat);
      setPlaceLng(parsedLng);
    }
    if (query.trim().length < 2) {
      setFromSuggestions([]);
      return;
    }
    setIsLoadingFrom(true);
    try {
      const localMatches = SUGGESTED_LOCATIONS.filter(
        (item) =>
          item.name.toLowerCase().includes(query.toLowerCase()) ||
          item.code.toLowerCase().includes(query.toLowerCase()),
      );

      const osmData = await searchLocationsOnline(query, 4);
      if (osmData && osmData.length > 0) {
        const formattedOsm = osmData.map((d: any) => ({
          name: d.display_name,
          code: "",
          type: "osm",
          lat: d.lat,
          lng: d.lon,
        }));
        setFromSuggestions([...localMatches, ...formattedOsm]);
      } else {
        setFromSuggestions(localMatches);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingFrom(false);
    }
  };

  const handleToSearch = async (query: string) => {
    setToLocation(query);
    const matched = findSuggestedLocation(query);
    if (matched) {
      const parsedLat = Number(matched.lat);
      const parsedLng = Number(matched.lng);
      setToLat(parsedLat);
      setToLng(parsedLng);
      setPlaceLat(parsedLat);
      setPlaceLng(parsedLng);
    }
    if (query.trim().length < 2) {
      setToSuggestions([]);
      return;
    }
    setIsLoadingTo(true);
    try {
      const localMatches = SUGGESTED_LOCATIONS.filter(
        (item) =>
          item.name.toLowerCase().includes(query.toLowerCase()) ||
          item.code.toLowerCase().includes(query.toLowerCase()),
      );

      const osmData = await searchLocationsOnline(query, 4);
      if (osmData && osmData.length > 0) {
        const formattedOsm = osmData.map((d: any) => ({
          name: d.display_name,
          code: "",
          type: "osm",
          lat: d.lat,
          lng: d.lon,
        }));
        setToSuggestions([...localMatches, ...formattedOsm]);
      } else {
        setToSuggestions(localMatches);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingTo(false);
    }
  };

  // Expanded mini map trackers
  const [expandedPlaceMapId, setExpandedPlaceMapId] = useState<string | null>(
    null,
  );

  const activeTrip = activeTripId ? trips[activeTripId] : null;

  // Auto-select first trip if none active
  useEffect(() => {
    const tripIds = Object.keys(trips);
    if (!activeTripId && tripIds.length > 0) {
      onSetActiveTripId(tripIds[0]);
    }
  }, [activeTripId, Object.keys(trips).join(',')]);

  // Scroll lock background when destination modal is open
  useEffect(() => {
    if (isAddingPlace) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isAddingPlace]);

  // Handle Drag & Drop / File Input Selection for ticket attachment
  const handleTicketFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const val = validateAttachmentFile(file);
      if (!val.valid) {
        setFormError(val.error || "Invalid file selection.");
        return;
      }
      setFormError(null);
      try {
        const compressed = await compressImageFile(file);
        setTicketAttachmentName(compressed.name);
        setTicketAttachmentData(compressed.data);
      } catch (err) {
        console.error("Error compressing ticket file:", err);
      }
    }
  };

  // Handle Drag & Drop / File Input Selection for Stay attachment
  const handleStayFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const val = validateAttachmentFile(file);
      if (!val.valid) {
        setFormError(val.error || "Invalid file selection.");
        return;
      }
      setFormError(null);
      try {
        const compressed = await compressImageFile(file);
        setStayAttachmentName(compressed.name);
        setStayAttachmentData(compressed.data);
      } catch (err) {
        console.error("Error compressing stay file:", err);
      }
    }
  };

  // Handle address autocomplete search for Stay
  const handleStayAddressSearch = (query: string) => {
    setStayAddress(query);
    if (query.trim().length > 2) {
      searchLocationsOnline(query, 5)
        .then((data) => setStayAddressSuggestions(data || []))
        .catch(() => setStayAddressSuggestions([]));
    } else {
      setStayAddressSuggestions([]);
    }
  };

  // Add Place to active trip timeline
  const handleAddPlace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip) return;
    if (isReadOnly) {
      throw new Error(
        "Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip.",
      );
    }
    setFormError(null);

    // Special handling for Stay tab: create two entries (Check in and Check out)
    if (planTab === "stay") {
      if (checkInTime && checkOutTime) {
        const inT = new Date(checkInTime).getTime();
        const outT = new Date(checkOutTime).getTime();
        if (!isNaN(inT) && !isNaN(outT) && outT <= inT) {
          setFormError("Check-out date and time must be after Check-in date and time.");
          return;
        }
      }

      const name = hotelName.trim() || "Accommodation";
      const checkInTitle = `Check in at ${name}`;
      const checkOutTitle = `Check out at ${name}`;

      const baseStamp = Date.now();
      const baseStem = editingPlace
        ? editingPlace.id.replace(/-in$|-out$/, "")
        : `place-${baseStamp}`;

      const checkInPlace: Place = {
        id: `${baseStem}-in`,
        title: checkInTitle,
        description: stayDesc,
        time:
          checkInTime ||
          (activeTrip.startDate ? `${activeTrip.startDate}T14:00` : ""),
        lat: Number(stayLat) || 0,
        lng: Number(stayLng) || 0,
        address: stayAddress,

        isStay: true,
        hotelName: name,
        checkInTime,
        checkOutTime,
        stayAddress,
        stayLat: Number(stayLat) || 0,
        stayLng: Number(stayLng) || 0,
        stayAttachment: stayAttachmentName || undefined,
        stayAttachmentData: stayAttachmentData || undefined,
        stayDesc,
      };

      const placesToAdd: Place[] = [checkInPlace];

      if (checkOutTime) {
        const checkOutPlace: Place = {
          ...checkInPlace,
          id: `${baseStem}-out`,
          title: checkOutTitle,
          time: checkOutTime,
        };
        placesToAdd.push(checkOutPlace);
      }

      const updatedTrips = { ...trips };
      const t = updatedTrips[activeTrip.id];
      if (t) {
        let newTimeline = [...(t.timeline || [])];

        if (editingPlace) {
          const idsToRemove = new Set([
            editingPlace.id,
            baseStem,
            `${baseStem}-in`,
            `${baseStem}-out`,
          ]);
          newTimeline = newTimeline.filter((p) => !idsToRemove.has(p.id));
        }

        newTimeline.push(...placesToAdd);

        // Sort timeline chronologically by time
        newTimeline.sort((a, b) => {
          const tA = new Date(a.time).getTime();
          const tB = new Date(b.time).getTime();
          if (isNaN(tA) || isNaN(tB)) return 0;
          return tA - tB;
        });

        updatedTrips[activeTrip.id] = {
          ...t,
          timeline: newTimeline,
        };
      }

      onUpdateTrips(updatedTrips);
      setIsAddingPlace(false);
      resetPlaceForm();
      return;
    }

    // Handling for Transport and Plan tabs
    let finalTitle = "";
    if (planTab === "transport") {
      const depTime = boardingTime || (activeTrip.startDate ? `${activeTrip.startDate}T09:00` : "");
      if (depTime && arrivalTime) {
        const depT = new Date(depTime).getTime();
        const arrT = new Date(arrivalTime).getTime();
        if (!isNaN(depT) && !isNaN(arrT) && arrT <= depT) {
          setFormError("Arrival date and time must be after Departure date and time.");
          return;
        }
      }

      finalTitle =
        `${transportType}: ${fromLocation || "TBD"} to ${toLocation || "TBD"}`.trim();
    } else {
      finalTitle = placeTitle.trim();
    }

    if (!finalTitle) return;

    const newPlace: Place = {
      id: `place-${Date.now()}`,
      title: finalTitle,
      description: planTab === "transport" ? transportDesc : placeDesc,
      time: planTab === "transport" ? boardingTime : placeTime,
      lat: Number(placeLat) || 0,
      lng: Number(placeLng) || 0,
      address:
        planTab === "transport"
          ? `From ${fromLocation} to ${toLocation}`
          : placeAddress,

      // Transport flags & fields
      isTransport: planTab === "transport",
      isTransportation: planTab === "transport",
      transportType: planTab === "transport" ? transportType : undefined,
      from: planTab === "transport" ? fromLocation : undefined,
      fromLocation: planTab === "transport" ? fromLocation : undefined,
      to: planTab === "transport" ? toLocation : undefined,
      toLocation: planTab === "transport" ? toLocation : undefined,
      fromLat:
        planTab === "transport"
          ? Number(fromLat) || Number(placeLat) || 0
          : undefined,
      fromLng:
        planTab === "transport"
          ? Number(fromLng) || Number(placeLng) || 0
          : undefined,
      toLat: planTab === "transport" ? Number(toLat) || 0 : undefined,
      toLng: planTab === "transport" ? Number(toLng) || 0 : undefined,
      boardingTime: planTab === "transport" ? (boardingTime || placeTime) : undefined,
      departureTime: planTab === "transport" ? (boardingTime || placeTime) : undefined,
      arrivalTime: planTab === "transport" ? arrivalTime : undefined,
      transportDesc: planTab === "transport" ? transportDesc : undefined,
      attachments: placeAttachments,
      ticketAttachment:
        planTab === "transport" ? (placeAttachments[0]?.name || ticketAttachmentName || undefined) : undefined,
      ticketAttachmentData:
        planTab === "transport" ? (placeAttachments[0]?.data || ticketAttachmentData || undefined) : undefined,

      // Stop attachment fields
      attachment: placeAttachments[0]?.name || undefined,
      attachmentData: placeAttachments[0]?.data || undefined,
    };

    const updatedTrips = { ...trips };
    const t = updatedTrips[activeTrip.id];
    if (t) {
      let newTimeline;
      if (editingPlace) {
        // Update existing, keeping original ID
        newTimeline = (t.timeline || []).map((p) =>
          p.id === editingPlace.id
            ? {
                ...newPlace,
                id: editingPlace.id,
                ...(editingPlace.isDailyHotelStop
                  ? {
                      isDailyHotelStop: true,
                      isCustomized: true,
                      hotelStopType: editingPlace.hotelStopType,
                    }
                  : {}),
              }
            : p,
        );
      } else {
        // Add new stop
        newTimeline = [...(t.timeline || []), newPlace];
      }

      // Sort timeline chronologically by time
      newTimeline.sort((a, b) => {
        const tA = new Date(a.time).getTime();
        const tB = new Date(b.time).getTime();
        if (isNaN(tA) || isNaN(tB)) return 0;
        return tA - tB;
      });

      updatedTrips[activeTrip.id] = {
        ...t,
        timeline: newTimeline,
      };
    }

    onUpdateTrips(updatedTrips);
    setIsAddingPlace(false);
    resetPlaceForm();
  };

  const resetPlaceForm = () => {
    setFormError(null);
    setPlanTab("plan");
    setPlaceTitle("");
    setPlaceDesc("");
    setPlaceTime("");
    setPlaceAddress("");
    setPlaceLat(0);
    setPlaceLng(0);
    setFromLat(0);
    setFromLng(0);
    setToLat(0);
    setToLng(0);
    setIsTransport(false);
    setIsStay(false);
    setTransportType("Flight");
    setFromLocation("");
    setToLocation("");
    setBoardingTime("");
    setArrivalTime("");
    setTransportDesc("");
    setTicketAttachmentName("");
    setTicketAttachmentData("");
    setHotelName("");
    setCheckInTime("");
    setCheckOutTime("");
    setStayAddress("");
    setStayLat(0);
    setStayLng(0);
    setStayAttachmentName("");
    setStayAttachmentData("");
    setStayDesc("");
    setAddressSuggestions([]);
    setFromSuggestions([]);
    setToSuggestions([]);
    setStayAddressSuggestions([]);
    setPlaceAttachments([]);
    setEditingPlace(null);
  };

  // Prepopulate form fields to edit an existing stop entry
  const startEditingPlace = (place: Place) => {
    setEditingPlace(place);
    setIsAddingPlace(true);
    setPlaceAttachments(getItemAttachments(place));

    // Fill form states
    if (place.isStay) {
      setPlanTab("stay");
      setIsStay(true);
      setIsTransport(false);
      setHotelName(
        place.hotelName ||
          place.title.replace(/^Check (in|out) at /i, "") ||
          "",
      );

      const baseStem = place.id ? place.id.replace(/-in$|-out$/, "") : "";
      const inEntry = (activeTrip.timeline || []).find(
        (p) => p.id === `${baseStem}-in` || (p.isStay && p.title.toLowerCase().includes("check in"))
      );
      const outEntry = (activeTrip.timeline || []).find(
        (p) => p.id === `${baseStem}-out` || (p.isStay && p.title.toLowerCase().includes("check out"))
      );
      const isCheckOutCard = place.id?.endsWith("-out") || place.title.toLowerCase().startsWith("check out");

      const resolvedInTime =
        place.checkInTime ||
        inEntry?.checkInTime ||
        inEntry?.time ||
        (!isCheckOutCard ? place.time : "") ||
        "";

      const resolvedOutTime =
        place.checkOutTime ||
        outEntry?.checkOutTime ||
        outEntry?.time ||
        (isCheckOutCard ? place.time : "") ||
        "";

      setCheckInTime(resolvedInTime);
      setCheckOutTime(resolvedOutTime);
      setStayAddress(place.stayAddress || place.address || "");
      setStayLat(place.stayLat || place.lat || 0);
      setStayLng(place.stayLng || place.lng || 0);
      setStayAttachmentName(place.stayAttachment || place.attachment || "");
      setStayAttachmentData(
        place.stayAttachmentData || place.attachmentData || "",
      );
      setStayDesc(place.stayDesc || place.description || "");
    } else if (place.isTransport || place.isTransportation) {
      setPlanTab("transport");
      setIsTransport(true);
      setIsStay(false);
      setTransportType(place.transportType || "Flight");
      setFromLocation(place.from || place.fromLocation || "");
      setToLocation(place.to || place.toLocation || "");
      setFromLat(place.fromLat || place.lat || 0);
      setFromLng(place.fromLng || place.lng || 0);
      setToLat(place.toLat || 0);
      setToLng(place.toLng || 0);
      setBoardingTime(place.boardingTime || place.departureTime || place.time || "");
      setArrivalTime(place.arrivalTime || "");
      setTransportDesc(place.transportDesc || place.description || "");
      setTicketAttachmentName(place.ticketAttachment || "");
      setTicketAttachmentData(place.ticketAttachmentData || "");
    } else {
      setPlanTab("plan");
      setIsTransport(false);
      setIsStay(false);
      setPlaceTitle(place.title || "");
      setPlaceDesc(place.description || "");
      setPlaceTime(place.time || "");
      setPlaceAddress(place.address || "");
      setPlaceLat(place.lat || 0);
      setPlaceLng(place.lng || 0);
    }

    // Scroll form container into view smoothly
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (!place.isTransport && !place.isStay) {
        placeTitleInputRef.current?.focus();
      }
    }, 150);
  };

  // Reassign a stop to a different day
  const handleMovePlaceToDay = (placeId: string, targetDateString: string) => {
    if (!activeTrip) return;
    if (isReadOnly) {
      throw new Error(
        "Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip.",
      );
    }

    const updatedTimeline = activeTrip.timeline.map((p) => {
      if (p.id === placeId) {
        // preserve the original HH:MM time part
        const currentTimePart = p.time.includes("T")
          ? p.time.split("T")[1]
          : "12:00";
        const newTime = `${targetDateString}T${currentTimePart}`;

        return {
          ...p,
          time: newTime,
          boardingTime: p.isTransport ? newTime : p.boardingTime,
          arrivalTime:
            p.isTransport && p.arrivalTime && p.arrivalTime.includes("T")
              ? `${targetDateString}T${p.arrivalTime.split("T")[1]}`
              : p.arrivalTime,
        };
      }
      return p;
    });

    // Sort chronologically by time
    updatedTimeline.sort((a, b) => {
      const tA = new Date(a.time).getTime();
      const tB = new Date(b.time).getTime();
      if (isNaN(tA) || isNaN(tB)) return 0;
      return tA - tB;
    });

    if (!activeTrip) return;
    const updatedTrips = { ...trips };
    if (updatedTrips[activeTrip.id]) {
      updatedTrips[activeTrip.id] = {
        ...updatedTrips[activeTrip.id],
        timeline: updatedTimeline,
      };
    }

    onUpdateTrips(updatedTrips);
  };

  // Sync coordinates when map picker target is selected
  useEffect(() => {
    if (!activeMapPickerTarget) return;

    let initialLat = 0;
    let initialLng = 0;
    let initialAddress = "";

    if (activeMapPickerTarget === "from") {
      initialLat = Number(fromLat) || 48.8566; // Paris fallback
      initialLng = Number(fromLng) || 2.3522;
      initialAddress = fromLocation || "";
    } else if (activeMapPickerTarget === "to") {
      initialLat = Number(toLat) || 48.8566;
      initialLng = Number(toLng) || 2.3522;
      initialAddress = toLocation || "";
    } else if (activeMapPickerTarget === "stay") {
      initialLat = Number(stayLat) || 48.8566;
      initialLng = Number(stayLng) || 2.3522;
      initialAddress = stayAddress || "";
    } else if (activeMapPickerTarget === "stop") {
      initialLat = Number(placeLat) || 48.8566;
      initialLng = Number(placeLng) || 2.3522;
      initialAddress = placeAddress || "";
    }

    // Fallback to active trip first timeline point with coordinates if empty
    if (
      (initialLat === 0 || initialLat === 48.8566) &&
      activeTrip &&
      activeTrip.timeline
    ) {
      const itemWithCoords = activeTrip.timeline.find(
        (item) => item.lat && item.lng,
      );
      if (itemWithCoords) {
        initialLat = itemWithCoords.lat;
        initialLng = itemWithCoords.lng;
      }
    }

    setPickerSelectedLat(initialLat);
    setPickerSelectedLng(initialLng);
    setPickerSelectedAddress(initialAddress);
    setPickerSearchQuery("");
    setPickerSuggestions([]);
    setIsMapFullscreen(false);
  }, [activeMapPickerTarget]); // Only trigger when modal opens/closes, NOT when activeTrip changes

  const executePickerSearch = async (query: string) => {
    const clean = query.trim();
    if (!clean) return;

    setIsPickerSearching(true);
    setHasPickerSearched(true);
    try {
      const res = await fetch(
        `/api/nominatim/search?q=${encodeURIComponent(clean)}&limit=6`,
      );
      if (res.ok) {
        const data = await res.json();
        setPickerSuggestions(data || []);
      } else {
        setPickerSuggestions([]);
      }
    } catch (err) {
      console.error(err);
      setPickerSuggestions([]);
    } finally {
      setIsPickerSearching(false);
    }
  };

  const handleConfirmPickerSelection = () => {
    if (!activeMapPickerTarget) return;

    if (activeMapPickerTarget === "from") {
      setFromLat(pickerSelectedLat);
      setFromLng(pickerSelectedLng);
      const rawLoc =
        pickerSelectedAddress ||
        `${pickerSelectedLat.toFixed(4)}, ${pickerSelectedLng.toFixed(4)}`;
      setFromLocation(rawLoc.split(",")[0].trim());
    } else if (activeMapPickerTarget === "to") {
      setToLat(pickerSelectedLat);
      setToLng(pickerSelectedLng);
      const rawLoc =
        pickerSelectedAddress ||
        `${pickerSelectedLat.toFixed(4)}, ${pickerSelectedLng.toFixed(4)}`;
      setToLocation(rawLoc.split(",")[0].trim());
    } else if (activeMapPickerTarget === "stay") {
      setStayLat(pickerSelectedLat);
      setStayLng(pickerSelectedLng);
      setStayAddress(
        pickerSelectedAddress ||
          `${pickerSelectedLat.toFixed(4)}, ${pickerSelectedLng.toFixed(4)}`,
      );
      setPlaceLat(pickerSelectedLat);
      setPlaceLng(pickerSelectedLng);
      setPlaceAddress(
        pickerSelectedAddress ||
          `${pickerSelectedLat.toFixed(4)}, ${pickerSelectedLng.toFixed(4)}`,
      );
    } else if (activeMapPickerTarget === "stop") {
      setPlaceLat(pickerSelectedLat);
      setPlaceLng(pickerSelectedLng);
      setPlaceAddress(
        pickerSelectedAddress ||
          `${pickerSelectedLat.toFixed(4)}, ${pickerSelectedLng.toFixed(4)}`,
      );
    }

    setActiveMapPickerTarget(null);
  };

  // Delete Place from timeline (initiates custom modal)
  const handleDeletePlace = (placeId: string, placeTitle: string) => {
    if (isReadOnly) {
      throw new Error(
        "Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip.",
      );
    }
    setDeletingPlace({ id: placeId, title: placeTitle });
  };

  // Natively confirm and execute stop deletion
  const confirmDeletePlace = () => {
    if (!deletingPlace || !activeTrip) return;
    if (isReadOnly) {
      throw new Error(
        "Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip.",
      );
    }
    const { id: placeId } = deletingPlace;
    const baseStem = placeId.replace(/-in$|-out$/, "");

    const targetPlace = (activeTrip.timeline || []).find((p) => p.id === placeId);
    const isDailyStop = targetPlace?.isDailyHotelStop || placeId.startsWith("auto-hotel-");

    const updatedRemovedIds = isDailyStop
      ? Array.from(new Set([...(activeTrip.removedDailyHotelStopIds || []), placeId]))
      : activeTrip.removedDailyHotelStopIds;

    const updatedTrips = { ...trips };
    if (updatedTrips[activeTrip.id]) {
      updatedTrips[activeTrip.id] = {
        ...updatedTrips[activeTrip.id],
        removedDailyHotelStopIds: updatedRemovedIds,
        timeline: (updatedTrips[activeTrip.id].timeline || []).filter(
          (p) =>
            p.id !== placeId &&
            p.id !== `${baseStem}-in` &&
            p.id !== `${baseStem}-out`,
        ),
        // Clean up expenses associated with this place
        expenses: (updatedTrips[activeTrip.id].expenses || []).map((exp) =>
          exp.placeId === placeId ||
          exp.placeId === `${baseStem}-in` ||
          exp.placeId === `${baseStem}-out`
            ? { ...exp, placeId: null }
            : exp,
        ),
      };
    }

    onUpdateTrips(updatedTrips);
    setDeletingPlace(null);
  };

  // Move destination stop up or down in the day, swapping times and array order
  const handleMovePlace = (placeId: string, direction: "up" | "down") => {
    if (!activeTrip) return;
    if (isReadOnly) {
      throw new Error(
        "Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip.",
      );
    }

    // Find the dayGroup containing this place
    const dayGroups = getTimelineDays();
    let currentDayGroup = null;
    let dayPlaceIndex = -1;

    for (const group of dayGroups) {
      const idx = group.places.findIndex((p) => p.id === placeId);
      if (idx !== -1) {
        currentDayGroup = group;
        dayPlaceIndex = idx;
        break;
      }
    }

    if (!currentDayGroup || dayPlaceIndex === -1) return;

    const targetIdx =
      direction === "up" ? dayPlaceIndex - 1 : dayPlaceIndex + 1;
    if (targetIdx < 0 || targetIdx >= currentDayGroup.places.length) return;

    const place = currentDayGroup.places[dayPlaceIndex];
    const targetPlace = currentDayGroup.places[targetIdx];

    const timeA = place.time;
    const timeB = targetPlace.time;

    const idxA = activeTrip.timeline.findIndex((p) => p.id === place.id);
    const idxB = activeTrip.timeline.findIndex((p) => p.id === targetPlace.id);

    if (idxA === -1 || idxB === -1) return;

    const updatedTimeline = [...activeTrip.timeline];

    // Create swapped copies
    const updatedPlace = {
      ...place,
      time: timeB,
      boardingTime: place.isTransport ? timeB : place.boardingTime,
      ...(place.isDailyHotelStop || place.id.startsWith("auto-hotel-")
        ? { isDailyHotelStop: true, isCustomized: true }
        : {}),
    };

    const updatedTargetPlace = {
      ...targetPlace,
      time: timeA,
      boardingTime: targetPlace.isTransport ? timeA : targetPlace.boardingTime,
      ...(targetPlace.isDailyHotelStop || targetPlace.id.startsWith("auto-hotel-")
        ? { isDailyHotelStop: true, isCustomized: true }
        : {}),
    };

    // Swap positions in timeline array
    updatedTimeline[idxA] = updatedTargetPlace;
    updatedTimeline[idxB] = updatedPlace;

    let updatedTrip: Trip = {
      ...trips[activeTrip.id],
      timeline: updatedTimeline,
      updatedAt: new Date().toISOString(),
    };

    if (updatedTrip.enableHotelDailyStops) {
      updatedTrip = reconcileDailyHotelStops(updatedTrip);
    }

    const updatedTrips = { ...trips, [activeTrip.id]: updatedTrip };
    onUpdateTrips(updatedTrips);
  };

  // Add an expense from within the timeline stop card
  const handleQuickExpenseAdd = (e: React.FormEvent, placeId: string) => {
    e.preventDefault();
    if (!activeTrip || !quickExpTitle.trim() || !quickExpAmount.trim()) return;
    if (isReadOnly) {
      throw new Error(
        "Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip.",
      );
    }

    const rawAmt = parseFloat(quickExpAmount);
    if (isNaN(rawAmt) || rawAmt <= 0) return;

    const spendCurrency = quickExpCurrency || activeTrip.baseCurrency || "USD";
    const rate = getSetupExchangeRate(activeTrip, spendCurrency);
    // Store converted amount in base currency
    const amountInBase = Math.round((rawAmt / rate) * 100) / 100;

    const newExpense: Expense = {
      id: `exp-${Date.now()}`,
      title: quickExpTitle.trim(),
      amount: amountInBase,
      spendAmount: rawAmt,
      spendCurrency: spendCurrency,
      category: quickExpCategory || "Other",
      paidBy: quickExpPaidBy || activeTrip.travelers?.[0] || "Me",
      splitType: "equal",
      paymentType: quickExpPaymentType || "Cash",
      splits: activeTrip.travelers.map((t) => ({
        traveler: t,
        amount:
          Math.round((amountInBase / activeTrip.travelers.length) * 100) / 100,
      })),
      placeId: placeId,
      date: new Date().toISOString().split("T")[0],
    };

    const updatedTrips = { ...trips };
    if (updatedTrips[activeTrip.id]) {
      updatedTrips[activeTrip.id] = {
        ...updatedTrips[activeTrip.id],
        expenses: [...(updatedTrips[activeTrip.id].expenses || []), newExpense],
      };
    }

    onUpdateTrips(updatedTrips);
    setLoggingExpensePlaceId(null);
    setQuickExpTitle("");
    setQuickExpAmount("");
  };

  const startLoggingExpense = (place: Place) => {
    setLoggingExpensePlaceId(place.id);
    setQuickExpTitle(`Tour: ${place.title}`);
    setQuickExpAmount("");
    setQuickExpCurrency(activeTrip?.baseCurrency || "USD");
    setQuickExpPaidBy(activeTrip?.travelers?.[0] || "Me");

    const cats = activeTrip?.categories || [
      "Food",
      "Airline Tickets",
      "Accommodation",
      "Visa Fee",
      "Shopping",
      "Activities",
      "Other",
    ];
    setQuickExpCategory(
      cats.includes("Activities") ? "Activities" : cats[0] || "Other",
    );

    const pTypes = activeTrip?.paymentTypes || ["Cash", "Credit Card"];
    setQuickExpPaymentType(pTypes[0]);
  };

  // Sub-component for individual Place mini Leaflet Map
  const MiniMap = ({ place }: { place: Place }) => {
    const miniMapRef = useRef<HTMLDivElement>(null);

    const isTrans = !!place.isTransport;
    const dLat =
      Number(isTrans ? (place.fromLat ?? place.lat ?? 0) : (place.lat ?? 0)) ||
      0;
    const dLng =
      Number(isTrans ? (place.fromLng ?? place.lng ?? 0) : (place.lng ?? 0)) ||
      0;
    const aLat = Number(isTrans ? (place.toLat ?? dLat) : dLat) || 0;
    const aLng = Number(isTrans ? (place.toLng ?? dLng) : dLng) || 0;

    useEffect(() => {
      const container = miniMapRef.current;
      if (!container) return;

      // Ensure clean initialization - remove any existing map from this container element
      if ((container as any)._leaflet_map) {
        try {
          (container as any)._leaflet_map.remove();
        } catch (e) {
          console.warn("Error removing existing map:", e);
        }
        (container as any)._leaflet_map = null;
      }
      (container as any)._leaflet_id = null;

      const map = L.map(container, {
        center: isTrans ? [(dLat + aLat) / 2, (dLng + aLng) / 2] : [dLat, dLng],
        zoom: isTrans ? 10 : 12,
        zoomControl: false,
        attributionControl: false,
      });
      (container as any)._leaflet_map = map;

      const isDarkPlannerMap2 = document.documentElement.classList.contains("dark");
      const tileUrlPlannerMap2 = isDarkPlannerMap2
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

      L.tileLayer(
        tileUrlPlannerMap2,
        {
          maxZoom: 20,
        },
      ).addTo(map);

      const customFromIcon = L.divIcon({
        className: "custom-mini-marker-from",
        html: `
          <div class="relative w-4 h-4 flex items-center justify-center">
            <div class="absolute bg-indigo-500 w-4 h-4 rounded-full animate-ping opacity-60"></div>
            <div class="w-3.5 h-3.5 rounded-full bg-indigo-600 border-2 border-indigo-100 shadow-sm"></div>
          </div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      const depLabel = (place.from || place.fromLocation || place.title || "").split(",")[0].trim();
      const arrLabel = (place.to || place.toLocation || "Destination").split(",")[0].trim();

      const departureMarker = L.marker([dLat, dLng], { icon: customFromIcon })
        .addTo(map)
        .bindPopup(`<strong>Departure:</strong> ${depLabel}`);

      let fitBoundsTimer: any = null;
      let popupTimer: any = null;
      let invalidateTimer: any = null;

      // Open departure popup after a slight delay to avoid layout race conditions
      popupTimer = setTimeout(() => {
        if (map && (map as any)._container) {
          departureMarker.openPopup();
        }
      }, 250);

      if (isTrans) {
        const customToIcon = L.divIcon({
          className: "custom-mini-marker-to",
          html: `
            <div class="relative w-4 h-4 flex items-center justify-center">
              <div class="absolute bg-rose-500 w-4 h-4 rounded-full animate-pulse opacity-40"></div>
              <div class="w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-rose-100 shadow-sm"></div>
            </div>
          `,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        L.marker([aLat, aLng], { icon: customToIcon })
          .addTo(map)
          .bindPopup(`<strong>Arrival:</strong> ${arrLabel}`);

        // Draw polyline connecting from and to locations
        L.polyline(
          [
            [dLat, dLng],
            [aLat, aLng],
          ],
          {
            color: "#6366f1",
            weight: 3,
            dashArray: "5, 10",
            opacity: 0.8,
          },
        ).addTo(map);

        // Adjust fitBounds after a slight delay to ensure Leaflet has initialized the container
        fitBoundsTimer = setTimeout(() => {
          if (map && (map as any)._container) {
            map.fitBounds(
              [
                [dLat, dLng],
                [aLat, aLng],
              ],
              { padding: [40, 40] },
            );
          }
        }, 100);
      }

      // Simple navigation controller trigger on render
      invalidateTimer = setTimeout(() => {
        if (map && (map as any)._container) {
          map.invalidateSize();
        }
      }, 200);

      return () => {
        if (fitBoundsTimer) clearTimeout(fitBoundsTimer);
        if (popupTimer) clearTimeout(popupTimer);
        if (invalidateTimer) clearTimeout(invalidateTimer);

        map.off();
        map.stop();
        map.remove();
        if (container) {
          delete (container as any)._leaflet_map;
        }
      };
    }, [place, dLat, dLng, aLat, aLng, isTrans]);

    return (
      <div className="relative mt-3 rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 shadow-inner h-48 w-full">
        <div ref={miniMapRef} className="h-full w-full" />
        <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-xl text-[10px] font-mono text-slate-600 border border-slate-200 shadow-sm z-50">
          {isTrans ? (
            <span>
              From: {dLat.toFixed(3)}, {dLng.toFixed(3)} | To: {aLat.toFixed(3)}
              , {aLng.toFixed(3)}
            </span>
          ) : (
            <span>
              Lat: {dLat.toFixed(4)} | Lng: {dLng.toFixed(4)}
            </span>
          )}
        </div>
      </div>
    );
  };

  // Helper to generate dates between startDate and endDate
  const getDatesInRange = (
    startDateStr: string,
    endDateStr: string,
  ): string[] => {
    const dates: string[] = [];
    if (!startDateStr) return dates;

    const start = new Date(startDateStr);
    const end = endDateStr ? new Date(endDateStr) : new Date(startDateStr);

    // Normalize both dates to midnight to prevent timezone shifting
    const current = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    );
    const last = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
    );

    let safetyCounter = 0;
    while (current <= last && safetyCounter < 100) {
      dates.push(current.toISOString().split("T")[0]);
      current.setUTCDate(current.getUTCDate() + 1);
      safetyCounter++;
    }
    return dates;
  };

  interface DayGroup {
    dayNumber: number; // 0 for unscheduled
    dateString: string;
    places: Place[];
  }

  const getTimelineDays = (): DayGroup[] => {
    if (!activeTrip) return [];

    const startStr = activeTrip.startDate;
    const endStr = activeTrip.endDate;

    const dayGroups: DayGroup[] = [];
    const unscheduledGroup: DayGroup = {
      dayNumber: 0,
      dateString: "Unscheduled",
      places: [],
    };

    if (startStr) {
      const dates = getDatesInRange(startStr, endStr);
      dates.forEach((date, index) => {
        dayGroups.push({
          dayNumber: index + 1,
          dateString: date,
          places: [],
        });
      });
    }

    // Assign places to days
    let places = activeTrip.timeline || [];
    if (timelineSearchQuery.trim()) {
      const query = timelineSearchQuery.toLowerCase().trim();
      places = places.filter((place) => {
        const matchesTitle = place.title?.toLowerCase().includes(query);
        const matchesDesc = place.description?.toLowerCase().includes(query);
        const matchesAddress = place.address?.toLowerCase().includes(query);
        const matchesFrom = place.from?.toLowerCase().includes(query);
        const matchesTo = place.to?.toLowerCase().includes(query);
        const matchesCarrier = place.carrier?.toLowerCase().includes(query);
        const matchesTransportType = place.transportType
          ?.toLowerCase()
          .includes(query);

        return !!(
          matchesTitle ||
          matchesDesc ||
          matchesAddress ||
          matchesFrom ||
          matchesTo ||
          matchesCarrier ||
          matchesTransportType
        );
      });
    }

    places.forEach((place) => {
      if (!place.time) {
        unscheduledGroup.places.push(place);
        return;
      }

      const placeDateStr = place.time.split("T")[0];
      const matchingGroup = dayGroups.find(
        (g) => g.dateString === placeDateStr,
      );
      if (matchingGroup) {
        matchingGroup.places.push(place);
      } else {
        // If place falls outside range, push to unscheduled/flexible
        unscheduledGroup.places.push(place);
      }
    });

    // Always show at least Day 1 if no dates are set at all
    if (dayGroups.length === 0) {
      dayGroups.push({
        dayNumber: 1,
        dateString: startStr || new Date().toISOString().split("T")[0],
        places: [...places],
      });
    }

    // If searching, filter out day groups that have NO matching places
    if (timelineSearchQuery.trim()) {
      return dayGroups.filter((dg) => dg.places.length > 0);
    }

    return dayGroups;
  };

  return (
    <div className="w-full space-y-6 text-left">
      {/* Dynamic inline print style tags */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          /* Hide main app elements */
          body * {
            visibility: hidden !important;
          }
          /* Show print section only */
          #trip-print-section, #trip-print-section * {
            visibility: visible !important;
          }
          #trip-print-section {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            display: block !important;
            color: #000000 !important;
            background: #ffffff !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `,
        }}
      />

      {activeTrip ? (
        <div className="space-y-4 sm:space-y-6 text-left w-full">
          {/* Top Quick Actions Bar - Add Plan, Map View, and AI Generate in a Single Line */}
          <div className="flex items-center gap-2 sm:gap-3 w-full">
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => {
                  if (isAddingPlace) {
                    setIsAddingPlace(false);
                    resetPlaceForm();
                  } else {
                    resetPlaceForm();
                    if (activeTrip?.startDate) {
                      setPlaceTime(`${activeTrip.startDate}T12:00`);
                      setBoardingTime(`${activeTrip.startDate}T09:00`);
                      setArrivalTime(`${activeTrip.startDate}T12:00`);
                    }
                    setIsAddingPlace(true);
                  }
                }}
                className="flex-1 flex items-center justify-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900 text-xs sm:text-sm font-bold transition shadow-xs cursor-pointer active:scale-98"
              >
                <Plus className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                <span className="truncate">{editingPlace ? "Editing Plan" : "Add Plan"}</span>
              </button>
            )}

            {onOpenMap && (
              <button
                type="button"
                onClick={() => onOpenMap?.()}
                className="flex-1 flex items-center justify-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-800 text-xs sm:text-sm font-bold transition shadow-xs cursor-pointer active:scale-98"
                title="View Trip Map"
              >
                <Map className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                <span className="truncate">Map View</span>
              </button>
            )}

            {!isReadOnly && !isGuestUser && (
              <button
                type="button"
                onClick={() => {
                  const countries = activeTrip?.countries || [];
                  if (countries.length === 0) {
                    setShowNoCountryNotice(true);
                    return;
                  }
                  setShowNoCountryNotice(false);
                  setIsGeminiModalOpen(true);
                }}
                className="flex-1 flex items-center justify-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 hover:from-indigo-500/20 hover:via-purple-500/20 hover:to-pink-500/20 border border-indigo-200/90 dark:border-indigo-800/80 text-indigo-700 dark:text-indigo-300 text-xs sm:text-sm font-extrabold transition shadow-xs cursor-pointer group active:scale-98"
                title="Auto-generate Itinerary with AI"
              >
                <Sparkles className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400 group-hover:rotate-12 transition-transform" />
                <span className="truncate">AI Generate</span>
              </button>
            )}
          </div>

          {/* No Country Warning Banner */}
          {!isGuestUser && showNoCountryNotice && (
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-2xl flex items-center justify-between text-amber-800 dark:text-amber-300 text-xs shadow-xs animate-in fade-in duration-150">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>
                  Please select at least one destination country in Trip Settings before generating an AI itinerary.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowNoCountryNotice(false)}
                className="p-1 text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200 transition cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Top Controls Card / Timeline heading card without internal buttons */}
          <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-5 text-left w-full">
            {/* Timeline header */}
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                <Navigation className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>Itinerary</span>
              </h3>
            </div>

          {/* Itinerary Search Bar & Group Expansion Controls */}
          <div className="space-y-2">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              </div>
              <input
                type="text"
                value={timelineSearchQuery}
                onChange={(e) => setTimelineSearchQuery(e.target.value)}
                placeholder="Search places, activities, carriers, or notes in timeline..."
                className="w-full text-xs pl-10 pr-10 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100 transition shadow-xs"
              />
              {timelineSearchQuery && (
                <button
                  type="button"
                  onClick={() => setTimelineSearchQuery("")}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-end text-[11px] font-semibold text-slate-500 dark:text-slate-400 px-1">
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={expandAllDays}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline transition font-bold cursor-pointer"
                >
                  Expand All
                </button>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <button
                  type="button"
                  onClick={collapseAllDays}
                  className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:underline transition font-bold cursor-pointer"
                >
                  Collapse All
                </button>
              </div>
            </div>
          </div>

          {/* Shared Reusable Add Plan Modal */}
          <AddPlanModal
            isOpen={isAddingPlace}
            initialDate={selectedPlanDate}
            onClose={() => {
              setIsAddingPlace(false);
              setEditingPlace(null);
              setSelectedPlanDate(undefined);
            }}
            activeTrip={activeTrip}
            editingPlace={editingPlace}
            onSavePlan={(placesToAdd) => {
              let newTimeline = [...(activeTrip.timeline || [])];
              if (editingPlace) {
                const isStayEdit =
                  editingPlace.isStay ||
                  editingPlace.id.endsWith('-in') ||
                  editingPlace.id.endsWith('-out') ||
                  placesToAdd.some((p) => p.isStay);

                if (isStayEdit) {
                  const baseStem = editingPlace.id.replace(/-in$|-out$/, '');
                  const idsToRemove = new Set([
                    editingPlace.id,
                    baseStem,
                    `${baseStem}-in`,
                    `${baseStem}-out`,
                  ]);
                  newTimeline = newTimeline.filter((p) => !idsToRemove.has(p.id));
                } else {
                  newTimeline = newTimeline.filter((p) => p.id !== editingPlace.id);
                  if (editingPlace.isDailyHotelStop) {
                    placesToAdd = placesToAdd.map((p) => ({
                      ...p,
                      isDailyHotelStop: true,
                      isCustomized: true,
                      hotelStopType: editingPlace.hotelStopType,
                    }));
                  }
                }
              }

              newTimeline.push(...placesToAdd);
              newTimeline.sort((a, b) => {
                const tA = new Date(a.time).getTime();
                const tB = new Date(b.time).getTime();
                if (isNaN(tA) || isNaN(tB)) return 0;
                return tA - tB;
              });

              onUpdateTrips({
                ...trips,
                [activeTrip.id]: {
                  ...activeTrip,
                  timeline: newTimeline,
                },
              });

              setIsAddingPlace(false);
              setEditingPlace(null);
            }}
          />

          {/* Gemini AI Itinerary Generator Modal */}
          {activeTrip && !isGuestUser && (
            <GeminiItineraryModal
              isOpen={isGeminiModalOpen}
              onClose={() => setIsGeminiModalOpen(false)}
              activeTrip={activeTrip}
              onApplyItinerary={handleApplyGeminiItinerary}
            />
          )}

          {false && (
                  <form
                    ref={formRef}
                    onSubmit={handleAddPlace}
                    className="space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                      <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                        {editingPlace
                          ? `Edit plan: ${editingPlace.title}`
                          : "Add plan to itinerary"}
                      </h4>
                    </div>

                    {/* 3 Tabs Selection Bar */}
                    <div className="flex items-center space-x-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl w-full">
                      <button
                        type="button"
                        onClick={() => {
                          setPlanTab("plan");
                          setIsTransport(false);
                          setIsStay(false);
                        }}
                        className={`flex-1 w-1/3 py-2 px-3 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                          planTab === "plan"
                            ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                            : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                        }`}
                      >
                        Plan
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPlanTab("transport");
                          setIsTransport(true);
                          setIsStay(false);
                        }}
                        className={`flex-1 w-1/3 py-2 px-3 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                          planTab === "transport"
                            ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                            : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                        }`}
                      >
                        Transport
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPlanTab("stay");
                          setIsTransport(false);
                          setIsStay(true);
                        }}
                        className={`flex-1 w-1/3 py-2 px-3 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                          planTab === "stay"
                            ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                            : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                        }`}
                      >
                        Stay
                      </button>
                    </div>

                    {/* TAB 1: PLAN */}
                    {planTab === "plan" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              Stop Title
                            </label>
                            <input
                              ref={placeTitleInputRef}
                              type="text"
                              required
                              placeholder="e.g. Louvre Museum Art Tour"
                              value={placeTitle}
                              onChange={(e) => setPlaceTitle(e.target.value)}
                              className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              Description
                            </label>
                            <textarea
                              placeholder="e.g. Guided tour looking at medieval sculptures."
                              value={placeDesc}
                              onChange={(e) => setPlaceDesc(e.target.value)}
                              className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 h-20 resize-none"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              Date / Time of Stop
                            </label>
                            <input
                              type="datetime-local"
                              min={
                                activeTrip.startDate
                                  ? `${activeTrip.startDate}T00:00`
                                  : undefined
                              }
                              max={
                                activeTrip.endDate
                                  ? `${activeTrip.endDate}T23:59`
                                  : undefined
                              }
                              value={placeTime}
                              onChange={(e) => setPlaceTime(e.target.value)}
                              className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 font-mono"
                            />
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="space-y-1 relative">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">
                                Address Location
                              </label>
                              <button
                                type="button"
                                onClick={() => setActiveMapPickerTarget("stop")}
                                className="text-[10px] font-bold px-2 py-0.5 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 transition shadow-xs flex items-center space-x-1 cursor-pointer"
                              >
                                <span>📍 Select on Map</span>
                              </button>
                            </div>
                            <LocationAutocomplete
                              value={placeAddress}
                              onChange={(val, lat, lng) => {
                                setPlaceAddress(val);
                                if (lat && lng) {
                                  setPlaceLat(lat);
                                  setPlaceLng(lng);
                                }
                              }}
                              placeholder="e.g. Rue de Rivoli, 75001 Paris"
                            />
                          </div>

                          {/* Coordinates inputs removed for cleaner UI */}

                          <AttachmentManager
                            attachments={placeAttachments}
                            onChange={setPlaceAttachments}
                            title="Stop Attachments & Files"
                          />
                        </div>
                      </div>
                    )}

                    {/* TAB 2: TRANSPORT */}
                    {planTab === "transport" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              Transport Method
                            </label>
                            <select
                              value={transportType}
                              onChange={(e) =>
                                setTransportType(e.target.value as any)
                              }
                              className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 font-bold"
                            >
                              <option value="Flight">✈️ Flight boarding</option>
                              <option value="Train">🚆 Train voyage</option>
                              <option value="Bus">🚌 Bus shuttle</option>
                              <option value="Ferry">
                                🚢 Ferry/Boat crossing
                              </option>
                              <option value="Car">🚗 Rental/Car ride</option>
                              <option value="Other">
                                🗺️ Other travel connection
                              </option>
                            </select>
                          </div>

                          <div className="space-y-1 relative">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">
                                From Location
                              </label>
                              <button
                                type="button"
                                onClick={() => setActiveMapPickerTarget("from")}
                                className="text-[10px] font-bold px-2 py-0.5 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 transition shadow-xs flex items-center space-x-1 cursor-pointer"
                              >
                                <span>📍 Select on Map</span>
                              </button>
                            </div>
                            <LocationAutocomplete
                              value={fromLocation}
                              onChange={(val, lat, lng) => {
                                setFromLocation(val);
                                if (lat && lng) {
                                  setFromLat(lat);
                                  setFromLng(lng);
                                  setPlaceLat(lat);
                                  setPlaceLng(lng);
                                }
                              }}
                              filterType={transportType === "flight" ? "airport" : "all"}
                              placeholder="e.g. London Heathrow Airport (LHR)"
                            />
                          </div>

                          <div className="space-y-1 relative">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">
                                To Location
                              </label>
                              <button
                                type="button"
                                onClick={() => setActiveMapPickerTarget("to")}
                                className="text-[10px] font-bold px-2 py-0.5 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 transition shadow-xs flex items-center space-x-1 cursor-pointer"
                              >
                                <span>📍 Select on Map</span>
                              </button>
                            </div>
                            <LocationAutocomplete
                              value={toLocation}
                              onChange={(val, lat, lng) => {
                                setToLocation(val);
                                if (lat && lng) {
                                  setToLat(lat);
                                  setToLng(lng);
                                  setPlaceLat(lat);
                                  setPlaceLng(lng);
                                }
                              }}
                              filterType={transportType === "flight" ? "airport" : "all"}
                              placeholder="e.g. Singapore Changi (SIN)"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">
                                Boarding Date & Time
                              </label>
                              <input
                                type="datetime-local"
                                required
                                min={
                                  activeTrip.startDate
                                    ? `${activeTrip.startDate}T00:00`
                                    : undefined
                                }
                                max={
                                  activeTrip.endDate
                                    ? `${activeTrip.endDate}T23:59`
                                    : undefined
                                }
                                value={boardingTime}
                                onChange={(e) =>
                                  setBoardingTime(e.target.value)
                                }
                                className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 font-mono"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">
                                Arrival Date & Time
                              </label>
                              <input
                                type="datetime-local"
                                required
                                min={
                                  boardingTime ||
                                  (activeTrip.startDate
                                    ? `${activeTrip.startDate}T00:00`
                                    : undefined)
                                }
                                max={
                                  activeTrip.endDate
                                    ? `${activeTrip.endDate}T23:59`
                                    : undefined
                                }
                                value={arrivalTime}
                                onChange={(e) => setArrivalTime(e.target.value)}
                                className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 font-mono"
                              />
                              {boardingTime && arrivalTime && new Date(arrivalTime).getTime() <= new Date(boardingTime).getTime() && (
                                <p className="text-[10px] text-rose-500 font-semibold mt-1">Arrival time must be after departure time</p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <AttachmentManager
                            attachments={placeAttachments}
                            onChange={setPlaceAttachments}
                            title="Boarding Pass & Tickets"
                          />

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              Details / Description
                            </label>
                            <textarea
                              placeholder="e.g. Gate 14B, Cabin Baggage limit 7kg. Boarding pass attached."
                              value={transportDesc}
                              onChange={(e) => setTransportDesc(e.target.value)}
                              className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 h-16 resize-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB 3: STAY */}
                    {planTab === "stay" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              Hotel / Stay Name
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Grand Hyatt Tokyo or Hilton Garden Inn"
                              value={hotelName}
                              onChange={(e) => setHotelName(e.target.value)}
                              className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 font-bold"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">
                                Check-in Date & Time
                              </label>
                              <input
                                type="datetime-local"
                                required
                                min={
                                  activeTrip.startDate
                                    ? `${activeTrip.startDate}T00:00`
                                    : undefined
                                }
                                max={
                                  activeTrip.endDate
                                    ? `${activeTrip.endDate}T23:59`
                                    : undefined
                                }
                                value={checkInTime}
                                onChange={(e) => setCheckInTime(e.target.value)}
                                className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 font-mono"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">
                                Check-out Date & Time
                              </label>
                              <input
                                type="datetime-local"
                                required
                                min={
                                  checkInTime ||
                                  (activeTrip.startDate
                                    ? `${activeTrip.startDate}T00:00`
                                    : undefined)
                                }
                                max={
                                  activeTrip.endDate
                                    ? `${activeTrip.endDate}T23:59`
                                    : undefined
                                }
                                value={checkOutTime}
                                onChange={(e) =>
                                  setCheckOutTime(e.target.value)
                                }
                                className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 font-mono"
                              />
                              {checkInTime && checkOutTime && new Date(checkOutTime).getTime() <= new Date(checkInTime).getTime() && (
                                <p className="text-[10px] text-rose-500 font-semibold mt-1">Check-out time must be after check-in time</p>
                              )}
                            </div>
                          </div>

                          <div className="space-y-1 relative">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">
                                Address Location
                              </label>
                              <button
                                type="button"
                                onClick={() => setActiveMapPickerTarget("stay")}
                                className="text-[10px] font-bold px-2 py-0.5 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 transition shadow-xs flex items-center space-x-1 cursor-pointer"
                              >
                                <span>📍 Select on Map</span>
                              </button>
                            </div>
                            <LocationAutocomplete
                              value={stayAddress}
                              onChange={(val, lat, lng) => {
                                setStayAddress(val);
                                if (lat && lng) {
                                  setStayLat(lat);
                                  setStayLng(lng);
                                }
                              }}
                              placeholder="e.g. 6-10-3 Roppongi, Minato-ku, Tokyo"
                            />
                          </div>
                        </div>

                        <div className="space-y-3">
                          {/* Coordinates inputs removed for cleaner UI */}

                          <AttachmentManager
                            attachments={placeAttachments}
                            onChange={setPlaceAttachments}
                            title="Hotel Voucher & Booking Documents"
                          />

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              Notes / Special Details
                            </label>
                            <textarea
                              placeholder="e.g. Booking Ref #12345, Deluxe Suite with Breakfast included."
                              value={stayDesc}
                              onChange={(e) => setStayDesc(e.target.value)}
                              className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 h-16 resize-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {formError && (
                      <div className="mt-3 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center space-x-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                        <span>{formError}</span>
                      </div>
                    )}

                    <div className="flex justify-end space-x-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingPlace(false);
                          resetPlaceForm();
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 transition cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-sm cursor-pointer"
                      >
                        {editingPlace
                          ? "Update Itinerary Item"
                          : "Add to Itinerary"}
                      </button>
                    </div>
                  </form>
          )}

          </div>

          {/* Itinerary Timeline list - Separate card for each day */}
          <div className="space-y-6 w-full">
            {getTimelineDays().length === 0 ? (
              <div className="p-8 sm:p-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-white dark:bg-slate-900 shadow-xs">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  No matching itinerary activities found.
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Try refining your search terms or adding a new stop.
                </p>
              </div>
            ) : (
              getTimelineDays().map((dayGroup, dayIdx) => (
                <React.Fragment key={`daygroup-${dayGroup.dateString || 'nodate'}-${dayIdx}`}>
                <div
                  className="p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs text-left w-full transition-colors"
                >
                  {/* Day Group Header */}
                  <div
                    onClick={() => toggleDayCollapsed(dayGroup.dateString)}
                    className="flex items-center justify-between text-left border-l-4 border-indigo-600 pl-3.5 py-2 bg-white dark:bg-slate-900 rounded-r-2xl pr-3 cursor-pointer hover:bg-slate-100/80 dark:hover:bg-slate-950 transition-colors"
                  >
                    <div className="flex items-center space-x-2.5">
                      {collapsedDays[dayGroup.dateString] ? (
                        <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                      ) : (
                        <ChevronUp className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      )}
                      <div>
                        <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                          Day {dayGroup.dayNumber}
                        </h4>
                        <p className="text-[10px] font-bold text-slate-400 font-mono">
                          {new Date(
                            dayGroup.dateString + "T00:00:00",
                          ).toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    </div>

                    <div
                      className="flex items-center space-x-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            resetPlaceForm();
                            setSelectedPlanDate(dayGroup.dateString);
                            setIsAddingPlace(true);
                            setPlaceTime(`${dayGroup.dateString}T12:00`);
                            setBoardingTime(`${dayGroup.dateString}T09:00`);
                            setArrivalTime(`${dayGroup.dateString}T12:00`);
                          }}
                          className="flex items-center justify-center p-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900 transition shadow-xs cursor-pointer"
                          title={`Add stop on Day ${dayGroup.dayNumber}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Timeline items for this Day Group */}
                  <AnimatePresence initial={false}>
                    {!collapsedDays[dayGroup.dateString] && (
                      <motion.div
                        key={`day-content-${dayGroup.dateString || 'nodate'}-${dayIdx}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{
                          height: { duration: 0.2, ease: [0.25, 1, 0.5, 1] },
                          opacity: { duration: 0.15, ease: "linear" },
                        }}
                        className="overflow-hidden"
                      >
                      <div className="relative pl-6 flex flex-col gap-6 pt-4 pb-1">
                      {/* Vertical line connecting bullets */}
                      {dayGroup.places.length > 0 && (
                        <div className="absolute left-[8px] top-6 bottom-6 w-[2px] bg-indigo-600 dark:bg-indigo-400 z-0 pointer-events-none rounded-full" />
                      )}

                      {dayGroup.places.length === 0 ? (
                        <div className="w-full aspect-[35/9] min-h-[80px] rounded-2xl border border-dashed border-slate-200/90 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/50 backdrop-blur-xs flex items-center justify-start gap-4 sm:gap-6 px-4 sm:px-6 py-2 overflow-hidden select-none">
                          <img
                            src={emptyTripsImage}
                            alt="Empty day"
                            className="h-full max-h-[85%] w-auto object-contain drop-shadow-xs pointer-events-none shrink-0"
                            loading="lazy"
                          />
                          <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 tracking-tight">
                            No plans for the day. Add something!
                          </span>
                        </div>
                      ) : (
                        dayGroup.places.map((place, dayPlaceIndex) => {
                          const index = activeTrip.timeline.findIndex(
                            (p) => p.id === place.id,
                          );
                          const isMapExpanded = expandedPlaceMapId === place.id;
                          const dateObj = place.time
                            ? new Date(place.time)
                            : null;
                          const formattedTime =
                            dateObj && !isNaN(dateObj.getTime())
                              ? dateObj.toLocaleString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : place.time || "Time TBD";

                          const associatedExpenses = (
                            activeTrip.expenses || []
                          ).filter((exp) => exp.placeId === place.id);

                          // Helper function to download saved attachments natively
                          const triggerFileDownload = async (
                            name: string,
                            data: string,
                          ) => {
                            await downloadOrShareBase64(
                              data || "data:text/plain;charset=utf-8,Attachment Content",
                              name || "attachment",
                              { dialogTitle: `Save or Share ${name || 'attachment'}` }
                            );
                          };

                          const hasOnlyDailyHotelStops = dayGroup.places.every(
                            (p) => p.isDailyHotelStop || p.id.startsWith("auto-hotel-")
                          );

                          return (
                            <motion.div
                              key={`place-${place.id || 'noid'}-${dayPlaceIndex}`}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.15 }}
                              className="relative group text-left z-10"
                            >
                              {/* Circle Timeline Bullet */}
                              <span className="absolute -left-[31px] top-4.5 flex h-4 w-4 ml-2 items-center justify-center rounded-full bg-white dark:bg-slate-900 border-2 border-indigo-600 dark:border-indigo-400 shadow-sm z-10">
                                <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400"></span>
                              </span>

                              {/* Collapsible Destination Details Card */}
                              <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-850 rounded-2xl transition-colors shadow-sm overflow-hidden">
                                {/* Header Bar: clicking toggles collapsed state */}
                                <div
                                  onClick={() => toggleStopExpanded(place.id)}
                                  className="p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850/60 transition-colors"
                                >
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex items-center space-x-2 flex-wrap gap-1">
                                      <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                                        Stop #{index + 1} • {formattedTime}
                                      </span>

                                      {place.isTransport && (
                                        <span className="bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border border-indigo-150 dark:border-indigo-900 flex items-center space-x-1">
                                          <span>
                                            🚀{" "}
                                            {place.transportType || "Transit"}{" "}
                                            Connection
                                          </span>
                                        </span>
                                      )}

                                      {place.isStay && (
                                        <span className="bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border border-amber-200 dark:border-amber-900 flex items-center space-x-1">
                                          <span>🏨 Stay / Accommodation</span>
                                        </span>
                                      )}

                                      {place.isDailyHotelStop && (
                                        <span className="bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border border-amber-200 dark:border-amber-900 flex items-center space-x-1">
                                          <span>🏨 Hotel {place.hotelStopType === 'start' ? 'Start' : 'End'} Stop</span>
                                        </span>
                                      )}

                                      {associatedExpenses.length > 0 && (
                                        <span className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 text-indigo-700 dark:text-indigo-400 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                                          {associatedExpenses.length} Expense
                                          {associatedExpenses.length > 1
                                            ? "s"
                                            : ""}{" "}
                                          Logged
                                        </span>
                                      )}
                                    </div>
                                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">
                                      {place.title}
                                    </h4>
                                  </div>

                                  <div className="flex items-center space-x-3.5 flex-shrink-0">
                                    {/* Simple inline badges shown when collapsed */}
                                    {!expandedStops[place.id] && (
                                      <div className="hidden sm:flex items-center space-x-2 text-[10px] text-slate-400 font-semibold">
                                        {place.address && (
                                          <span className="truncate max-w-[150px]">
                                            📍 {place.address}
                                          </span>
                                        )}
                                        {(place.isTransport
                                          ? place.ticketAttachment
                                          : place.attachment) && (
                                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[8px] font-mono font-bold text-slate-500">
                                            FILE
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    <div className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-350 p-1 rounded-lg transition-colors">
                                      {expandedStops[place.id] ? (
                                        <ChevronUp className="h-4 w-4" />
                                      ) : (
                                        <ChevronDown className="h-4 w-4" />
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Collapsible content (Details, Forms, Sub-lists) */}
                                <AnimatePresence initial={false}>
                                  {expandedStops[place.id] && (
                                    <motion.div
                                      key={`stop-details-${place.id || 'noid'}-${dayPlaceIndex}`}
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{
                                        height: { duration: 0.2, ease: [0.25, 1, 0.5, 1] },
                                        opacity: { duration: 0.15, ease: "linear" },
                                      }}
                                      className="overflow-hidden"
                                    >
                                      <div className="px-4 pb-4 pt-3 border-t border-slate-150 dark:border-slate-850/65 space-y-4 text-left">
                                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                                      <div className="space-y-2 text-left flex-1">
                                        {place.description && !(place.isTransport || place.isTransportation) && (
                                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">
                                            {place.description}
                                          </p>
                                        )}

                                        {/* Dynamic sentence summary for transport connections */}
                                        {(place.isTransport || place.isTransportation) && (() => {
                                          const depName =
                                            place.from ||
                                            place.fromLocation ||
                                            (place.title && place.title.includes(" to ")
                                              ? place.title.split(" to ")[0]?.replace(/^(Flight|Train|Bus|Ferry|Car|Other|Transport):\s*/i, "").trim()
                                              : "") ||
                                            "Departure Location";

                                          const arrName =
                                            place.to ||
                                            place.toLocation ||
                                            (place.title && place.title.includes(" to ")
                                              ? place.title.split(" to ")[1]?.trim()
                                              : "") ||
                                            "Arrival Location";

                                          const depTimeVal = place.boardingTime || place.departureTime || place.time;
                                          const arrTimeVal = place.arrivalTime;

                                          const formatTransportTime = (val?: string) => {
                                            if (!val) return "Time TBD";
                                            const d = new Date(val);
                                            if (isNaN(d.getTime())) return val;
                                            return d.toLocaleString("en-US", {
                                              month: "short",
                                              day: "numeric",
                                              hour: "2-digit",
                                              minute: "2-digit",
                                            });
                                          };

                                          return (
                                            <div className="bg-indigo-50/45 dark:bg-indigo-950/20 p-3.5 rounded-xl border border-indigo-100/50 dark:border-indigo-900/40 mt-2 animate-fade-in space-y-1.5">
                                              {/* Line 1: Headers */}
                                              <div className="flex items-center justify-between text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                                <span>DEPARTURE</span>
                                                <span className="text-right">ARRIVAL</span>
                                              </div>

                                              {/* Line 2: Dates */}
                                              <div className="flex items-center justify-between text-[10px] font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                                                <span>Departs: {formatTransportTime(depTimeVal)}</span>
                                                <span className="text-right">Arrives: {formatTransportTime(arrTimeVal)}</span>
                                              </div>

                                              {/* Line 3: Locations */}
                                              <div className="flex items-center justify-between gap-3 text-xs pt-1">
                                                <div className="font-bold text-slate-800 dark:text-slate-200 flex-1 leading-snug">
                                                  🛫 {depName}
                                                </div>
                                                <ArrowRight className="h-4 w-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
                                                <div className="font-bold text-slate-800 dark:text-slate-200 flex-1 text-right leading-snug">
                                                  🛬 {arrName}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })()}

                                        {/* Stay details card */}
                                        {place.isStay && (
                                          <div className="bg-amber-50/45 dark:bg-amber-950/20 p-3.5 rounded-xl border border-amber-100/50 dark:border-amber-900/40 mt-2 space-y-2 animate-fade-in">
                                            <div className="flex items-center space-x-3 text-xs">
                                              <div className="flex-1">
                                                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                                                  Check-in
                                                </span>
                                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                                  🏨{" "}
                                                  {place.hotelName ||
                                                    place.title}
                                                </span>
                                                <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 block mt-1">
                                                  In:{" "}
                                                  {place.checkInTime
                                                    ? new Date(
                                                        place.checkInTime,
                                                      ).toLocaleString(
                                                        "en-US",
                                                        {
                                                          month: "short",
                                                          day: "numeric",
                                                          hour: "2-digit",
                                                          minute: "2-digit",
                                                        },
                                                      )
                                                    : "Time TBD"}
                                                </span>
                                              </div>
                                              <ArrowRight className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                                              <div className="flex-1 text-right">
                                                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                                                  Check-out
                                                </span>
                                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                                  🔑 Check-out
                                                </span>
                                                <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 block mt-1">
                                                  Out:{" "}
                                                  {place.checkOutTime
                                                    ? new Date(
                                                        place.checkOutTime,
                                                      ).toLocaleString(
                                                        "en-US",
                                                        {
                                                          month: "short",
                                                          day: "numeric",
                                                          hour: "2-digit",
                                                          minute: "2-digit",
                                                        },
                                                      )
                                                    : "Time TBD"}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        )}

                                         <div className="flex flex-wrap gap-2 pt-1">
                                           {/* Place Attachments list with Eye & Delete buttons */}
                                           {(() => {
                                             const placeAtts = getItemAttachments(place);
                                             if (placeAtts.length === 0) return null;
                                             return placeAtts.map((att, attIdx) => (
                                               <div
                                                 key={att.id || attIdx}
                                                 className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 text-[10px] font-bold text-indigo-700 dark:text-indigo-300"
                                               >
                                                 <span className="truncate max-w-[120px]">{att.name}</span>
                                                 <div className="flex items-center space-x-1 border-l border-indigo-200 dark:border-indigo-800 pl-1">
                                                   <button
                                                     type="button"
                                                     onClick={(e) => {
                                                       e.stopPropagation();
                                                       setAttachmentViewer({
                                                         isOpen: true,
                                                         title: `Attachment - ${place.title}`,
                                                         attachments: placeAtts,
                                                         initialIndex: attIdx,
                                                         placeId: place.id,
                                                       });
                                                     }}
                                                     className="p-1 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded cursor-pointer transition flex items-center space-x-0.5 text-indigo-700 dark:text-indigo-300"
                                                     title="View attachment"
                                                   >
                                                     <Eye className="h-3 w-3" />
                                                     <span className="text-[9px]">View</span>
                                                   </button>
                                                   {!isReadOnly && (
                                                     <button
                                                       type="button"
                                                       onClick={(e) => {
                                                         e.stopPropagation();
                                                         handleRemovePlaceAttachment(place.id, att.id);
                                                       }}
                                                       className="p-1 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded cursor-pointer transition"
                                                       title="Delete attachment"
                                                     >
                                                       <Trash2 className="h-3 w-3" />
                                                     </button>
                                                   )}
                                                 </div>
                                               </div>
                                             ));
                                           })()}

                                          {place.address && (
                                            <div className="inline-flex items-center space-x-1 text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/60 px-2.5 py-1 rounded-lg font-medium border border-slate-200/50 dark:border-slate-800">
                                              <span>📍 {place.address}</span>
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Stop Modification Actions bar */}
                                      <div
                                        className="flex items-center space-x-1.5 py-1 max-w-full overflow-x-auto self-end md:self-start [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {/* Move Up/Down buttons (only visible if more than 1 place exists in the day and not only hotel stops) */}
                                        {dayGroup.places.length > 1 &&
                                          !hasOnlyDailyHotelStops &&
                                          !isReadOnly && (
                                            <>
                                              {/* Move Up Button */}
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleMovePlace(
                                                    place.id,
                                                    "up",
                                                  )
                                                }
                                                disabled={dayPlaceIndex === 0}
                                                className={`p-2 rounded-xl border transition-all shadow-sm shrink-0 ${
                                                  dayPlaceIndex === 0
                                                    ? "bg-slate-50 dark:bg-slate-900 border-slate-150 dark:border-slate-800 text-slate-200 dark:text-slate-800 cursor-not-allowed"
                                                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-850"
                                                }`}
                                                title="Move Stop Up"
                                              >
                                                <ArrowUp className="h-3.5 w-3.5" />
                                              </button>

                                              {/* Move Down Button */}
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleMovePlace(
                                                    place.id,
                                                    "down",
                                                  )
                                                }
                                                disabled={
                                                  dayPlaceIndex ===
                                                  dayGroup.places.length - 1
                                                }
                                                className={`p-2 rounded-xl border transition-all shadow-sm shrink-0 ${
                                                  dayPlaceIndex ===
                                                  dayGroup.places.length - 1
                                                    ? "bg-slate-50 dark:bg-slate-900 border-slate-150 dark:border-slate-800 text-slate-200 dark:text-slate-800 cursor-not-allowed"
                                                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-850"
                                                }`}
                                                title="Move Stop Down"
                                              >
                                                <ArrowDown className="h-3.5 w-3.5" />
                                              </button>
                                            </>
                                          )}

                                        {/* Edit Button */}
                                        {!isReadOnly && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              startEditingPlace(place)
                                            }
                                            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-850 transition shadow-sm shrink-0"
                                            title="Edit plan details"
                                          >
                                            <Edit2 className="h-3.5 w-3.5" />
                                          </button>
                                        )}

                                        {/* Move Stop to Another Day Button (Hidden for Stay / Accommodation cards) */}
                                        {!isReadOnly &&
                                          !place.isStay &&
                                          !place.isDailyHotelStop &&
                                          !place.id?.endsWith("-in") &&
                                          !place.id?.endsWith("-out") &&
                                          !place.title?.toLowerCase().startsWith("check in") &&
                                          !place.title?.toLowerCase().startsWith("check out") && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setMovingPlace(place);
                                              setTargetMoveDateString(
                                                place.time
                                                  ? place.time.split("T")[0]
                                                  : "",
                                              );
                                            }}
                                            className={`p-2 rounded-xl border transition-all shadow-sm shrink-0 ${
                                              movingPlace?.id === place.id
                                                ? "bg-amber-500 border-amber-500 text-white shadow-md"
                                                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-amber-655 hover:bg-slate-50 dark:hover:bg-slate-850"
                                            }`}
                                            title="Move entry to another day"
                                          >
                                            <Calendar className="h-3.5 w-3.5" />
                                          </button>
                                        )}

                                        {/* Toggle Expense form button */}
                                        {!isReadOnly && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (
                                                loggingExpensePlaceId ===
                                                place.id
                                              ) {
                                                setLoggingExpensePlaceId(null);
                                              } else {
                                                startLoggingExpense(place);
                                              }
                                            }}
                                            className={`p-2 rounded-xl border transition-all shadow-sm shrink-0 ${
                                              loggingExpensePlaceId === place.id
                                                ? "bg-indigo-600 border-indigo-600 text-white shadow-md"
                                                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-850"
                                            }`}
                                            title="Add Expense for this Stop"
                                          >
                                            <Plus className="h-3.5 w-3.5" />
                                          </button>
                                        )}

                                        {/* View Stop on Map */}
                                        <button
                                          type="button"
                                          onClick={() => onOpenMap?.(place.id)}
                                          className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-850 transition-all shadow-sm cursor-pointer shrink-0"
                                          title="View Stop on Full Screen Map"
                                        >
                                          <Map className="h-3.5 w-3.5" />
                                        </button>

                                        {/* Delete button */}
                                        {!isReadOnly && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleDeletePlace(
                                                place.id,
                                                place.title,
                                              )
                                            }
                                            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-rose-655 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition shadow-sm shrink-0"
                                            title="Delete stop from itinerary"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {/* Inline add expense form */}
                                    {loggingExpensePlaceId === place.id && (
                                      <form
                                        onSubmit={(e) =>
                                          handleQuickExpenseAdd(e, place.id)
                                        }
                                        className="bg-white dark:bg-slate-900 border border-indigo-150 dark:border-indigo-900 p-4 rounded-xl space-y-3 shadow-inner"
                                      >
                                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-850 pb-1.5">
                                          <h5 className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center space-x-1">
                                            <DollarSign className="h-3.5 w-3.5" />
                                            <span>Log Itinerary Expense</span>
                                          </h5>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setLoggingExpensePlaceId(null)
                                            }
                                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold"
                                          >
                                            Cancel
                                          </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
                                          <div className="space-y-1">
                                            <label className="text-[9px] font-bold text-slate-400 uppercase">
                                              Expense Title
                                            </label>
                                            <input
                                              type="text"
                                              required
                                              placeholder="e.g. Louvre Guided Tour Ticket"
                                              value={quickExpTitle}
                                              onChange={(e) =>
                                                setQuickExpTitle(e.target.value)
                                              }
                                              className="w-full text-xs px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
                                            />
                                          </div>

                                          <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                              <label className="text-[9px] font-bold text-slate-400 uppercase">
                                                Amount
                                              </label>
                                              <input
                                                type="number"
                                                step="any"
                                                required
                                                placeholder="50.00"
                                                value={quickExpAmount}
                                                onChange={(e) =>
                                                  setQuickExpAmount(
                                                    e.target.value,
                                                  )
                                                }
                                                className="w-full text-xs px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg outline-none focus:border-indigo-500 font-mono text-slate-800 dark:text-slate-100"
                                              />
                                            </div>
                                            <div className="space-y-1">
                                              <label className="text-[9px] font-bold text-slate-400 uppercase">
                                                Currency
                                              </label>
                                              <select
                                                value={quickExpCurrency}
                                                onChange={(e) =>
                                                  setQuickExpCurrency(
                                                    e.target.value,
                                                  )
                                                }
                                                className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100 font-bold"
                                              >
                                                <option
                                                  value={
                                                    activeTrip.baseCurrency ||
                                                    "USD"
                                                  }
                                                >
                                                  {activeTrip.baseCurrency ||
                                                    "USD"}
                                                </option>
                                                {(activeTrip.currencies || [])
                                                  .filter(
                                                    (c) =>
                                                      c !==
                                                      (activeTrip.baseCurrency ||
                                                        "USD"),
                                                  )
                                                  .map((c) => (
                                                    <option key={c} value={c}>
                                                      {c}
                                                    </option>
                                                  ))}
                                              </select>
                                            </div>
                                          </div>

                                          <div className="space-y-1">
                                            <label className="text-[9px] font-bold text-slate-400 uppercase">
                                              Paid By
                                            </label>
                                            <select
                                              value={quickExpPaidBy}
                                              onChange={(e) =>
                                                setQuickExpPaidBy(
                                                  e.target.value,
                                                )
                                              }
                                              className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
                                            >
                                              {activeTrip.travelers.map((t) => (
                                                <option key={t} value={t}>
                                                  {t}
                                                </option>
                                              ))}
                                            </select>
                                          </div>

                                          <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                              <label className="text-[9px] font-bold text-slate-400 uppercase">
                                                Category
                                              </label>
                                              <select
                                                value={quickExpCategory}
                                                onChange={(e) =>
                                                  setQuickExpCategory(
                                                    e.target.value,
                                                  )
                                                }
                                                className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
                                              >
                                                {(
                                                  activeTrip.categories || [
                                                    "Food",
                                                    "Accommodation",
                                                    "Activities",
                                                    "Shopping",
                                                    "Other",
                                                  ]
                                                )
                                                  .filter((cat) => cat !== "Forex Conversion" && !cat.startsWith("Forex in ") && cat !== "Settlement" && cat !== "Peer Transfer")
                                                  .map((cat) => (
                                                  <option key={cat} value={cat}>
                                                    {cat}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                            <div className="space-y-1">
                                              <label className="text-[9px] font-bold text-slate-400 uppercase">
                                                Payment Type
                                              </label>
                                              <select
                                                value={quickExpPaymentType}
                                                onChange={(e) =>
                                                  setQuickExpPaymentType(
                                                    e.target.value,
                                                  )
                                                }
                                                className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
                                              >
                                                {(
                                                  activeTrip.paymentTypes || [
                                                    "Cash",
                                                    "Credit Card",
                                                  ]
                                                ).map((pt) => (
                                                  <option key={pt} value={pt}>
                                                    {pt}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                          </div>
                                        </div>

                                        <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setLoggingExpensePlaceId(null)
                                            }
                                            className="px-3 py-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-800"
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            type="submit"
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] transition shadow-sm"
                                          >
                                            Add Expense
                                          </button>
                                        </div>
                                      </form>
                                    )}

                                    {/* Display any expenses logged for this specific stop */}
                                    {associatedExpenses.length > 0 && (
                                      <div className="pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 text-left">
                                        <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                          Logged Expenses for this stop
                                        </h5>
                                        <div className="space-y-1.5">
                                          {associatedExpenses.map((exp, eIdx) => (
                                            <div
                                              key={`stop-exp-${exp.id || 'noid'}-${eIdx}`}
                                              className="flex items-center justify-between bg-white dark:bg-slate-950 border border-slate-200/50 dark:border-slate-800 px-3 py-1.5 rounded-xl text-xs shadow-xs"
                                            >
                                              <div className="flex items-center space-x-2">
                                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                                  {exp.title}
                                                </span>
                                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold capitalize">
                                                  {exp.category}
                                                </span>
                                              </div>
                                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                                {exp.spendCurrency ||
                                                  activeTrip.baseCurrency ||
                                                  "USD"}{" "}
                                                {(
                                                  exp.spendAmount ??
                                                  exp.amount ??
                                                  0
                                                ).toFixed(2)}
                                                {exp.spendCurrency &&
                                                  exp.spendCurrency !==
                                                    activeTrip.baseCurrency && (
                                                    <span className="text-[9px] text-slate-400 block text-right font-normal">
                                                      ({activeTrip.baseCurrency}{" "}
                                                      {(
                                                        exp.amount ?? 0
                                                      ).toFixed(2)}
                                                      )
                                                    </span>
                                                  )}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </motion.div>
                          );
                        })
                      )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {dayIdx === 0 && (
                  <AdBanner
                    type="native-feed"
                    onOpenUpgradeModal={onOpenUpgradeModal}
                  />
                )}
                </React.Fragment>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 p-12 rounded-[32px] border border-slate-200 dark:border-slate-800 text-center text-slate-500 max-w-lg mx-auto mt-10 shadow-sm">
          <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            No Trip Selected
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            Create a new trip or select an existing one from the Home Map to
            edit your travel itinerary timeline.
          </p>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingPlace &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-[100]">
            <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 max-w-sm w-full shadow-2xl text-left space-y-4 max-h-[90vh] overflow-y-auto min-w-0">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Confirm Deletion
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Are you sure you want to delete{" "}
                <strong className="text-slate-800 dark:text-slate-200">
                  "{deletingPlace.title}"
                </strong>{" "}
                from your itinerary? This will remove this stop and un-tag any
                logged expenses from it.
              </p>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingPlace(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-850 dark:hover:text-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeletePlace}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-sm"
                >
                  Delete Stop
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Move Stop Modal */}
      {movingPlace &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-[110]">
            <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 max-w-sm w-full shadow-2xl text-left space-y-4 max-h-[90vh] overflow-y-auto min-w-0">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>Move Plan to Different Date</span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Select a new day to move{" "}
                <strong className="text-slate-800 dark:text-slate-200">
                  "{movingPlace.title}"
                </strong>{" "}
                to. The activity time (
                <strong>
                  {movingPlace.time
                    ? new Date(movingPlace.time).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Time TBD"}
                </strong>
                ) will be preserved.
              </p>

              <div className="max-h-52 overflow-y-auto border border-slate-150 dark:border-slate-800 rounded-xl p-2 divide-y divide-slate-100 dark:divide-slate-800/60">
                {getTimelineDays()
                  .filter((dg) => dg.dayNumber > 0)
                  .map((dg) => {
                    const isCurrentDay = movingPlace.time
                      ? movingPlace.time.split("T")[0] === dg.dateString
                      : false;
                    return (
                      <button
                        key={dg.dateString}
                        type="button"
                        disabled={isCurrentDay}
                        onClick={() => setTargetMoveDateString(dg.dateString)}
                        className={`w-full text-left text-xs px-3 py-2.5 rounded-lg flex items-center justify-between transition ${
                          isCurrentDay
                            ? "bg-slate-50 dark:bg-slate-950/45 text-slate-400 dark:text-slate-600 cursor-not-allowed font-medium"
                            : targetMoveDateString === dg.dateString
                              ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 font-bold border border-indigo-200/50 dark:border-indigo-900/50"
                              : "hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 font-medium"
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold">
                            Day {dg.dayNumber}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">
                            {new Date(
                              dg.dateString + "T00:00:00",
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        </div>

                        {isCurrentDay ? (
                          <span className="text-[9px] font-mono font-bold bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-600 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                            Current
                          </span>
                        ) : targetMoveDateString === dg.dateString ? (
                          <span className="h-4 w-4 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">
                            ✓
                          </span>
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-slate-300 dark:border-slate-700" />
                        )}
                      </button>
                    );
                  })}

                {getTimelineDays().filter((dg) => dg.dayNumber > 0).length ===
                  0 && (
                  <div className="text-slate-400 text-[10px] font-medium text-center py-4">
                    No days configured. Set your trip dates in settings.
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-850">
                <button
                  type="button"
                  onClick={() => {
                    setMovingPlace(null);
                    setTargetMoveDateString("");
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-850 dark:hover:text-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!targetMoveDateString}
                  onClick={() => {
                    if (targetMoveDateString) {
                      handleMovePlaceToDay(
                        movingPlace.id,
                        targetMoveDateString,
                      );
                      setMovingPlace(null);
                      setTargetMoveDateString("");
                    }
                  }}
                  className={`font-bold px-4 py-2 rounded-xl text-xs transition shadow-sm ${
                    targetMoveDateString
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  Confirm Move
                </button>
              </div>
            </div>
          </div>,
          document.body,
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
                isMapFullscreen={true}
                flyToTrigger={flyToTrigger}
              />

              {/* Search Box Widget at top */}
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
                    onChange={(e) => {
                      setPickerSearchQuery(e.target.value);
                      setHasPickerSearched(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        executePickerSearch(pickerSearchQuery);
                      }
                    }}
                    className="min-w-0 flex-1 w-full text-xs bg-transparent outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 font-medium"
                  />
                  {pickerSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setPickerSearchQuery("");
                        setPickerSuggestions([]);
                        setHasPickerSearched(false);
                      }}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 mr-1 p-0.5 cursor-pointer shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => executePickerSearch(pickerSearchQuery)}
                    disabled={isPickerSearching || !pickerSearchQuery.trim()}
                    className="px-3.5 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white rounded-full transition flex items-center space-x-1 cursor-pointer shrink-0 disabled:cursor-not-allowed shadow-2xs"
                  >
                    {isPickerSearching ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <span>Search</span>
                    )}
                  </button>
                </div>

                {/* Suggestions / Search Results Dropdown */}
                {(pickerSuggestions.length > 0 || (hasPickerSearched && !isPickerSearching)) && (
                  <div className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                    {pickerSuggestions.length > 0 ? (
                      pickerSuggestions.map((s, idx) => (
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
                            setPickerSearchQuery("");
                            setHasPickerSearched(false);
                          }}
                          className="p-3 text-xs text-slate-750 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer flex items-center space-x-2.5 transition"
                        >
                          <span className="text-indigo-500 text-sm shrink-0">📍</span>
                          <span className="truncate font-medium">
                            {s.display_name || s.name}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          No matching places found for "<span className="font-bold text-slate-700 dark:text-slate-200">{pickerSearchQuery}</span>"
                        </p>
                      </div>
                    )}
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

              {/* Constant center pin */}
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

              {/* Bottom Floating Panel */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 w-[92vw] max-w-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-800/90 flex flex-col gap-3">
                {/* Line 1: Complete location address & coordinates */}
                <div className="flex items-start space-x-2.5 min-w-0">
                  <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-lg shrink-0 mt-0.5">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug break-words">
                      {pickerSelectedAddress || "Selected location on map"}
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
          document.body,
        )}

      {/* Lightbox Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col w-full min-w-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white">
              <h3 className="font-bold text-sm truncate flex items-center gap-2">
                <span>🖼️</span>
                <span>{previewImage.title || 'Attachment Preview'}</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await downloadOrShareBase64(
                      previewImage.src,
                      previewImage.title || 'attachment',
                      { dialogTitle: `Save or Share ${previewImage.title || 'attachment'}` }
                    );
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition text-xs flex items-center gap-1 font-semibold cursor-pointer"
                  title="Download image"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-white transition cursor-pointer"
                  title="Close modal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="p-2 overflow-auto max-h-[calc(90vh-60px)] flex items-center justify-center bg-slate-950">
              <img
                src={previewImage.src}
                alt={previewImage.title || 'Preview'}
                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-lg"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Attachment Viewer Modal */}
      <AttachmentViewerModal
        isOpen={attachmentViewer.isOpen}
        onClose={() => setAttachmentViewer({ isOpen: false })}
        fileName={attachmentViewer.fileName}
        fileData={attachmentViewer.fileData}
        attachments={attachmentViewer.attachments}
        initialIndex={attachmentViewer.initialIndex}
        title={attachmentViewer.title}
        onDeleteAttachment={(attId) => {
          if (attachmentViewer.placeId) {
            handleRemovePlaceAttachment(attachmentViewer.placeId, attId);
          }
        }}
      />
    </div>
  );
}

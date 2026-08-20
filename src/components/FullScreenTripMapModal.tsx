import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, MapPin, Navigation, Plane, Train, Bus, Info, ChevronRight, Map, Compass, 
  Play, Pause, RotateCcw, FastForward, Layers, Download, Share2, Route, Gauge, 
  Calendar, Eye, ArrowRight, Car, EyeOff, Sparkles, Check, ExternalLink, Plus, Minus,
  ChevronUp, ChevronDown
} from 'lucide-react';
import { Trip, Place } from '../types';
import L from 'leaflet';
import { motion, AnimatePresence } from 'motion/react';
import { copyToClipboard } from '../lib/clipboardUtils';
import { useBackButton } from '../lib/backButtonHandler';
import { downloadOrShareText } from '../lib/nativeShareDownload';

interface FullScreenTripMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: Trip;
  theme: 'light' | 'dark';
  initialSelectedPlaceId?: string | null;
}

type MapTileStyle = 'voyager' | 'positron' | 'streets' | 'osm' | 'satellite' | 'terrain' | 'dark';

const TILE_LAYERS: Record<MapTileStyle, { name: string; url: string; attribution: string }> = {
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

export default function FullScreenTripMapModal({
  isOpen,
  onClose,
  trip,
  theme,
  initialSelectedPlaceId,
}: FullScreenTripMapModalProps) {
  useBackButton('fullscreen-trip-map-modal', isOpen, onClose, 100);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const animationMarkerRef = useRef<L.Marker | null>(null);
  const animationTimerRef = useRef<any>(null);
  const markersRef = useRef<{ [placeId: string]: L.Marker }>({});

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTileStyle, setActiveTileStyle] = useState<MapTileStyle>('voyager');

  useEffect(() => {
    if (isOpen) {
      setActiveTileStyle('voyager');
    }
  }, [isOpen]);
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('all');
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  // Animation Journey States
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 4>(1);

  const [showFullTripOverride, setShowFullTripOverride] = useState(false);

  const isSingleStopMode = Boolean(initialSelectedPlaceId) && !showFullTripOverride;
  const isDark = theme === 'dark';
  const focusedPlace = useMemo(() => {
    if (!initialSelectedPlaceId) return null;
    return trip.timeline?.find(p => p.id === initialSelectedPlaceId) || null;
  }, [trip.timeline, initialSelectedPlaceId]);

  // Update theme tile default if props change and not overridden
  useEffect(() => {
    setActiveTileStyle(theme === 'dark' ? 'dark' : 'voyager');
  }, [theme]);

  useEffect(() => {
    if (isOpen) {
      setShowFullTripOverride(false);
      if (typeof initialSelectedPlaceId === 'string' && initialSelectedPlaceId) {
        setSelectedPlaceId(initialSelectedPlaceId);
        setSidebarOpen(false);
      } else {
        setSelectedPlaceId(null);
        setSidebarOpen(false); // Default to partially closed (peek mode)
      }
      setIsPlaying(false);
      setPlaybackIndex(0);
    }
  }, [isOpen, initialSelectedPlaceId]);

  // Extract day list from trip for filtering with exact day numbers
  const dayFilters = useMemo(() => {
    const daysSet = new Set<string>();
    trip.timeline?.forEach(p => {
      if (p.time) {
        const dateStr = p.time.split('T')[0];
        if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          daysSet.add(dateStr);
        }
      }
    });

    const sortedDates = Array.from(daysSet).sort();
    if (sortedDates.length === 0) return [];

    let baseDateStr = sortedDates[0];
    if (trip.startDate && /^\d{4}-\d{2}-\d{2}$/.test(trip.startDate.split('T')[0])) {
      const cleanStart = trip.startDate.split('T')[0];
      if (cleanStart <= sortedDates[0]) {
        baseDateStr = cleanStart;
      }
    }

    const baseMs = new Date(baseDateStr + 'T00:00:00').getTime();

    return sortedDates.map(dateStr => {
      const curMs = new Date(dateStr + 'T00:00:00').getTime();
      const diffDays = Math.round((curMs - baseMs) / (1000 * 60 * 60 * 24));
      const dayNumber = Math.max(1, diffDays + 1);
      return {
        dateString: dateStr,
        dayNumber,
      };
    });
  }, [trip.timeline, trip.startDate]);

  // Filter valid timeline items with coords
  const validTimeline = useMemo(() => {
    const allValid = trip.timeline?.filter(p => {
      if (p.isTransportation || p.isTransport) {
        return (
          (typeof p.fromLat === 'number' && typeof p.fromLng === 'number') ||
          (typeof p.toLat === 'number' && typeof p.toLng === 'number') ||
          (typeof p.lat === 'number' && typeof p.lng === 'number')
        );
      }
      return typeof p.lat === 'number' && typeof p.lng === 'number';
    }) || [];

    if (isSingleStopMode && initialSelectedPlaceId) {
      const single = allValid.filter(p => p.id === initialSelectedPlaceId);
      if (single.length > 0) return single;
    }

    if (selectedDayFilter === 'all') {
      return allValid.filter(p => !p.isDailyHotelStop);
    }
    return allValid.filter(p => p.time && p.time.startsWith(selectedDayFilter));
  }, [trip.timeline, selectedDayFilter, isSingleStopMode, initialSelectedPlaceId]);

  // Flattened route coordinates and leg details for distance math
  const routePoints = useMemo(() => {
    const points: { lat: number; lng: number; place: Place; legDistanceKm: number }[] = [];
    let cumDistanceMeters = 0;

    validTimeline.forEach((place) => {
      const isTransport = place.isTransportation || place.isTransport;
      if (isTransport) {
        const depLat = place.fromLat ?? place.lat;
        const depLng = place.fromLng ?? place.lng;
        const arrLat = place.toLat ?? place.lat;
        const arrLng = place.toLng ?? place.lng;

        if (typeof depLat === 'number' && typeof depLng === 'number') {
          let legMeters = 0;
          if (points.length > 0) {
            const prev = points[points.length - 1];
            legMeters = L.latLng(prev.lat, prev.lng).distanceTo(L.latLng(depLat, depLng));
          }
          cumDistanceMeters += legMeters;
          points.push({ lat: depLat, lng: depLng, place, legDistanceKm: Math.round(legMeters / 100) / 10 });
        }

        if (typeof arrLat === 'number' && typeof arrLng === 'number' && (arrLat !== depLat || arrLng !== depLng)) {
          let legMeters = 0;
          if (points.length > 0) {
            const prev = points[points.length - 1];
            legMeters = L.latLng(prev.lat, prev.lng).distanceTo(L.latLng(arrLat, arrLng));
          }
          cumDistanceMeters += legMeters;
          points.push({ lat: arrLat, lng: arrLng, place, legDistanceKm: Math.round(legMeters / 100) / 10 });
        }
      } else {
        if (typeof place.lat === 'number' && typeof place.lng === 'number') {
          let legMeters = 0;
          if (points.length > 0) {
            const prev = points[points.length - 1];
            legMeters = L.latLng(prev.lat, prev.lng).distanceTo(L.latLng(place.lat, place.lng));
          }
          cumDistanceMeters += legMeters;
          points.push({ lat: place.lat, lng: place.lng, place, legDistanceKm: Math.round(legMeters / 100) / 10 });
        }
      }
    });

    return {
      points,
      totalDistanceKm: Math.round(cumDistanceMeters / 1000),
      totalDistanceMiles: Math.round((cumDistanceMeters / 1000) * 0.621371),
    };
  }, [validTimeline]);

  // Map Initialization & Updates
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    let innerFlyToTimer: any = null;
    let innerInvalidateTimer: any = null;

    const initTimer = setTimeout(() => {
      if (!mapContainerRef.current) return;
      const container = mapContainerRef.current;

      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.stop();
          mapInstanceRef.current.off();
          mapInstanceRef.current.remove();
        } catch (e) {
          console.warn('Error removing mapInstanceRef:', e);
        }
        mapInstanceRef.current = null;
      }

      if ((container as any)._leaflet_map) {
        try {
          (container as any)._leaflet_map.stop?.();
          (container as any)._leaflet_map.off?.();
          (container as any)._leaflet_map.remove();
        } catch (e) {
          console.warn('Error removing existing map:', e);
        }
        (container as any)._leaflet_map = null;
      }

      (container as any)._leaflet_id = null;

      let centerLat = 20;
      let centerLng = 0;
      if (validTimeline.length > 0) {
        const first = validTimeline[0];
        centerLat = first.fromLat ?? first.lat ?? 20;
        centerLng = first.fromLng ?? first.lng ?? 0;
      }

      const map = L.map(container, {
        center: [centerLat, centerLng],
        zoom: 6,
        zoomControl: false,
        attributionControl: false,
      });

      mapInstanceRef.current = map;
      (container as any)._leaflet_map = map;

      const tileConfig = TILE_LAYERS[activeTileStyle] || TILE_LAYERS.voyager;
      const tileLayer = L.tileLayer(tileConfig.url, {
        maxZoom: 19,
        attribution: tileConfig.attribution,
      }).addTo(map);
      tileLayerRef.current = tileLayer;

      const markerGroup = L.layerGroup().addTo(map);
      const tempMarkers: { [placeId: string]: L.Marker } = {};
      const allCoords: L.LatLngTuple[] = [];

      validTimeline.forEach((place, index) => {
        const isTransport = place.isTransportation || place.isTransport;

        if (isTransport) {
          const departureLat = place.fromLat ?? place.lat;
          const departureLng = place.fromLng ?? place.lng;
          const arrivalLat = place.toLat ?? place.lat;
          const arrivalLng = place.toLng ?? place.lng;

          const hasDeparture = typeof departureLat === 'number' && typeof departureLng === 'number';
          const hasArrival = typeof arrivalLat === 'number' && typeof arrivalLng === 'number';

          if (hasDeparture) {
            allCoords.push([departureLat, departureLng]);
            const dIcon = L.divIcon({
              className: 'custom-timeline-marker-departure',
              html: `
                <div class="relative w-9 h-9 flex items-center justify-center">
                  <div class="absolute bg-indigo-500/30 w-9 h-9 rounded-full animate-ping opacity-30"></div>
                  <div class="w-7 h-7 rounded-xl bg-indigo-600 border-2 border-white shadow-lg flex items-center justify-center text-white font-extrabold text-[11px]">
                    ${index + 1}
                  </div>
                </div>
              `,
              iconSize: [36, 36],
              iconAnchor: [18, 18],
            });

            const popupContent = `
              <div class="p-1 pr-5 ${isDark ? 'text-slate-100' : 'text-slate-900'} font-sans min-w-[150px]">
                <div class="text-[9px] uppercase tracking-wider font-extrabold ${isDark ? 'text-indigo-400' : 'text-indigo-600'}">Stop ${index + 1} • Departure</div>
                <h4 class="font-bold text-xs ${isDark ? 'text-slate-100' : 'text-slate-900'} leading-tight truncate max-w-[150px]">${place.title}</h4>
                <div class="text-[10px] ${isDark ? 'text-slate-300' : 'text-slate-600'}">From: <strong>${(place.from || 'Origin').split(',')[0].trim()}</strong></div>
              </div>
            `;

            const m = L.marker([departureLat, departureLng], { icon: dIcon })
              .bindPopup(popupContent, { closeButton: true })
              .addTo(markerGroup);

            tempMarkers[`${place.id}-dep`] = m;
          }

          if (hasArrival) {
            allCoords.push([arrivalLat, arrivalLng]);
            const aIcon = L.divIcon({
              className: 'custom-timeline-marker-arrival',
              html: `
                <div class="relative w-9 h-9 flex items-center justify-center">
                  <div class="absolute bg-teal-500/30 w-9 h-9 rounded-full animate-pulse opacity-30"></div>
                  <div class="w-7 h-7 rounded-xl bg-teal-600 border-2 border-white shadow-lg flex items-center justify-center text-white font-extrabold text-[11px]">
                    ${index + 2}
                  </div>
                </div>
              `,
              iconSize: [36, 36],
              iconAnchor: [18, 18],
            });

            const popupContent = `
              <div class="p-1 pr-5 ${isDark ? 'text-slate-100' : 'text-slate-900'} font-sans min-w-[150px]">
                <div class="text-[9px] uppercase tracking-wider font-extrabold ${isDark ? 'text-teal-400' : 'text-teal-600'}">Stop ${index + 2} • Arrival</div>
                <h4 class="font-bold text-xs ${isDark ? 'text-slate-100' : 'text-slate-900'} leading-tight truncate max-w-[150px]">${place.title}</h4>
                <div class="text-[10px] ${isDark ? 'text-slate-300' : 'text-slate-600'}">To: <strong>${(place.to || 'Destination').split(',')[0].trim()}</strong></div>
              </div>
            `;

            const m = L.marker([arrivalLat, arrivalLng], { icon: aIcon })
              .bindPopup(popupContent, { closeButton: true })
              .addTo(markerGroup);

            tempMarkers[`${place.id}-arr`] = m;
            tempMarkers[place.id] = m;
          }

          if (hasDeparture && hasArrival) {
            L.polyline([[departureLat, departureLng], [arrivalLat, arrivalLng]], {
              color: '#4f46e5',
              weight: 3.5,
              dashArray: '8, 8',
              opacity: 0.85,
            }).addTo(markerGroup);
          }
        } else {
          allCoords.push([place.lat, place.lng]);
          const placeIcon = L.divIcon({
            className: 'custom-timeline-marker-place',
            html: `
              <div class="relative w-9 h-9 flex items-center justify-center">
                <div class="absolute bg-indigo-500/20 w-9 h-9 rounded-full"></div>
                <div class="w-7 h-7 rounded-xl bg-indigo-600 border-2 border-white shadow-lg flex items-center justify-center text-white font-black text-xs">
                  ${index + 1}
                </div>
              </div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });

          const popupContent = `
            <div class="p-1 pr-5 ${isDark ? 'text-slate-100' : 'text-slate-900'} font-sans min-w-[150px]">
              <div class="text-[9px] uppercase tracking-wider font-extrabold ${isDark ? 'text-indigo-400' : 'text-indigo-600'}">Stop ${index + 1}</div>
              <h4 class="font-bold text-xs ${isDark ? 'text-slate-100' : 'text-slate-900'} leading-tight truncate max-w-[150px]">${place.title}</h4>
              ${place.description ? `<p class="text-[10px] ${isDark ? 'text-slate-300' : 'text-slate-600'} truncate max-w-[150px]">${place.description}</p>` : ''}
            </div>
          `;

          const m = L.marker([place.lat, place.lng], { icon: placeIcon })
            .bindPopup(popupContent, { closeButton: true })
            .addTo(markerGroup);

          tempMarkers[place.id] = m;
        }
      });

      // Sequential route polyline connecting points
      if (allCoords.length > 1) {
        L.polyline(allCoords, {
          color: activeTileStyle === 'dark' ? '#818cf8' : '#4f46e5',
          weight: 3,
          opacity: 0.75,
          dashArray: '6, 6',
        }).addTo(markerGroup);
      }

      markersRef.current = tempMarkers;

      if (allCoords.length > 0) {
        try {
          map.fitBounds(L.latLngBounds(allCoords), {
            padding: [60, 60],
            maxZoom: 14,
            animate: false,
          });
        } catch (e) {}
      }

      if (typeof initialSelectedPlaceId === 'string' && initialSelectedPlaceId) {
        const targetPlace = validTimeline.find(p => p.id === initialSelectedPlaceId);
        if (targetPlace) {
          let targetLat = targetPlace.lat;
          let targetLng = targetPlace.lng;
          if (targetPlace.isTransportation || targetPlace.isTransport) {
            targetLat = targetPlace.fromLat ?? targetPlace.lat;
            targetLng = targetPlace.fromLng ?? targetPlace.lng;
          }
          if (typeof targetLat === 'number' && typeof targetLng === 'number') {
            innerFlyToTimer = setTimeout(() => {
              if (mapInstanceRef.current && (map as any)._container) {
                try {
                  map.flyTo([targetLat, targetLng], 14, { animate: false });
                  const m = tempMarkers[targetPlace.id] || tempMarkers[`${targetPlace.id}-dep`] || tempMarkers[`${targetPlace.id}-arr`];
                  if (m) m.openPopup();
                } catch (e) {}
              }
            }, 40);
          }
        }
      }

      map.on('popupopen', (e: any) => {
        const foundEntry = Object.entries(tempMarkers).find(([_, marker]) => marker === e.popup._source);
        if (foundEntry) {
          const key = foundEntry[0];
          const cleanId = key.replace('-dep', '').replace('-arr', '');
          setSelectedPlaceId(cleanId);
        }
      });

      innerInvalidateTimer = setTimeout(() => {
        if (mapInstanceRef.current && (map as any)._container) {
          try {
            map.invalidateSize();
          } catch (e) {}
        }
      }, 50);

    }, 10);

    return () => {
      clearTimeout(initTimer);
      if (innerFlyToTimer) clearTimeout(innerFlyToTimer);
      if (innerInvalidateTimer) clearTimeout(innerInvalidateTimer);

      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.stop();
          mapInstanceRef.current.off();
          mapInstanceRef.current.remove();
        } catch (e) {
          // ignore
        }
        mapInstanceRef.current = null;
      }
      if (mapContainerRef.current) {
        const container = mapContainerRef.current as any;
        if (container._leaflet_map) {
          try {
            container._leaflet_map.stop?.();
            container._leaflet_map.off?.();
            container._leaflet_map.remove();
          } catch (e) {}
          container._leaflet_map = null;
        }
        container._leaflet_id = null;
      }
      markersRef.current = {};
    };
  }, [isOpen, trip.id, selectedDayFilter, activeTileStyle, isSingleStopMode, initialSelectedPlaceId]);

  // Handle Journey Animation Player Loop
  useEffect(() => {
    if (!isPlaying || routePoints.points.length === 0) {
      if (animationTimerRef.current) clearInterval(animationTimerRef.current);
      return;
    }

    const intervalMs = Math.max(800, 2400 / playbackSpeed);

    animationTimerRef.current = setInterval(() => {
      setPlaybackIndex((prevIndex) => {
        const nextIndex = prevIndex + 1;
        if (nextIndex >= routePoints.points.length) {
          setIsPlaying(false);
          return prevIndex;
        }

        const point = routePoints.points[nextIndex];
        const map = mapInstanceRef.current;
        if (map && point) {
          map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), 12), {
            animate: true,
            duration: 0.6,
          });

          // Focus marker popup
          const m = markersRef.current[point.place.id] || markersRef.current[`${point.place.id}-dep`] || markersRef.current[`${point.place.id}-arr`];
          if (m) m.openPopup();
          setSelectedPlaceId(point.place.id);
        }

        return nextIndex;
      });
    }, intervalMs);

    return () => {
      if (animationTimerRef.current) clearInterval(animationTimerRef.current);
    };
  }, [isPlaying, playbackSpeed, routePoints.points]);

  // Handle direct index scrub from animation progress bar
  const handleScrubPlayback = (idx: number) => {
    if (idx < 0 || idx >= routePoints.points.length) return;
    setPlaybackIndex(idx);
    const point = routePoints.points[idx];
    const map = mapInstanceRef.current;
    if (map && point) {
      map.flyTo([point.lat, point.lng], 13, { animate: true, duration: 0.35 });
      const m = markersRef.current[point.place.id] || markersRef.current[`${point.place.id}-dep`] || markersRef.current[`${point.place.id}-arr`];
      if (m) m.openPopup();
      setSelectedPlaceId(point.place.id);
    }
  };

  const handleSelectPlace = (place: Place) => {
    setSelectedPlaceId(place.id);
    const map = mapInstanceRef.current;
    if (!map) return;

    const marker = markersRef.current[place.id] || markersRef.current[`${place.id}-dep`] || markersRef.current[`${place.id}-arr`];

    let targetLat = place.lat;
    let targetLng = place.lng;

    if (place.isTransportation || place.isTransport) {
      targetLat = place.fromLat ?? place.lat;
      targetLng = place.fromLng ?? place.lng;
    }

    if (typeof targetLat === 'number' && typeof targetLng === 'number') {
      map.flyTo([targetLat, targetLng], 14, { animate: true, duration: 0.35 });
      if (marker) marker.openPopup();
    }
  };

  // Download standard GPX Route File
  const handleDownloadGPX = async () => {
    if (routePoints.points.length === 0) return;

    let gpxContent = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    gpxContent += `<gpx version="1.1" creator="ViaDia Travel Tracker">\n`;
    gpxContent += `  <trk>\n`;
    gpxContent += `    <name>${trip.title.replace(/</g, '&lt;')} Route</name>\n`;
    gpxContent += `    <trkseg>\n`;

    routePoints.points.forEach((pt, idx) => {
      gpxContent += `      <trkpt lat="${pt.lat}" lon="${pt.lng}">\n`;
      gpxContent += `        <name>Stop ${idx + 1}: ${pt.place.title.replace(/</g, '&lt;')}</name>\n`;
      if (pt.place.time) gpxContent += `        <time>${pt.place.time}</time>\n`;
      gpxContent += `      </trkpt>\n`;
    });

    gpxContent += `    </trkseg>\n`;
    gpxContent += `  </trk>\n`;
    gpxContent += `</gpx>`;

    const filename = `${trip.title.replace(/[^a-zA-Z0-9_\-]/g, '_')}_route.gpx`;
    await downloadOrShareText(gpxContent, filename, 'application/gpx+xml', {
      dialogTitle: `Share or Save ${trip.title} GPX Route`
    });

    setCopyToast('Exported GPX route file!');
    setTimeout(() => setCopyToast(null), 3000);
  };

  // Copy text itinerary route summary
  const handleCopyRouteSummary = async () => {
    let summary = `🗺️ Route Summary for "${trip.title}"\n`;
    summary += `Total Distance: ${routePoints.totalDistanceKm.toLocaleString()} km (${routePoints.totalDistanceMiles.toLocaleString()} miles)\n`;
    summary += `Total Interactive Stops: ${validTimeline.length}\n\n`;

    validTimeline.forEach((p, idx) => {
      summary += `${idx + 1}. ${p.title}`;
      if (p.time) summary += ` (${p.time.replace('T', ' ')})`;
      if (p.address) summary += ` - ${p.address}`;
      summary += `\n`;
    });

    const success = await copyToClipboard(summary);
    if (success) {
      setCopyToast('Route itinerary summary copied to clipboard!');
      setTimeout(() => setCopyToast(null), 3000);
    }
  };

  if (!isOpen) return null;

  const currentScrubPoint = routePoints.points[playbackIndex];

  return createPortal(
    <div className={`fixed inset-0 z-[9999] flex flex-col md:flex-row overflow-hidden font-sans select-none ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
      
      {/* Toast Notification */}
      {copyToast && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-[10000] px-4 py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-full shadow-2xl flex items-center space-x-2 animate-in fade-in duration-200">
          <Sparkles className="h-4 w-4 text-emerald-200" />
          <span>{copyToast}</span>
        </div>
      )}

      {/* Main Map Container */}
      <div className={`flex-1 relative h-full w-full overflow-hidden ${isDark ? 'bg-slate-950' : 'bg-slate-100'}`}>
        
        {/* Top Header Overlay Control Bar (Only for full route mode) */}
        {!isSingleStopMode && (
          <div className="absolute top-[max(env(safe-area-inset-top,0px)+0.5rem,1.75rem)] left-4 right-4 z-20 pointer-events-none flex items-center justify-between gap-3">
            {/* Left Title Badge & Day Selector */}
            <div className={`pointer-events-auto flex items-center space-x-2 backdrop-blur-md p-2 rounded-2xl shadow-xl max-w-[80vw] overflow-x-auto no-scrollbar border ${
              isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white/95 border-slate-200/90 text-slate-800'
            }`}>
              <div className="flex items-center space-x-2 px-2.5 py-1 bg-indigo-600 text-white rounded-xl text-xs font-black shrink-0">
                <Route className="h-4 w-4" />
                <span className="hidden sm:inline">Route Visualizer</span>
              </div>

              {/* Day filter chips */}
              <div className="flex items-center space-x-1 shrink-0">
                <button
                  onClick={() => setSelectedDayFilter('all')}
                  className={`px-3 py-1 rounded-xl text-[11px] font-extrabold transition cursor-pointer ${
                    selectedDayFilter === 'all'
                      ? (isDark ? 'bg-white text-slate-900 shadow-sm' : 'bg-slate-900 text-white shadow-sm')
                      : (isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100')
                  }`}
                >
                  All Days
                </button>
                {dayFilters.map((filterObj, fIdx) => (
                  <button
                    key={`map-dayfilter-${filterObj.dateString}-${fIdx}`}
                    onClick={() => setSelectedDayFilter(filterObj.dateString)}
                    className={`px-3 py-1 rounded-xl text-[11px] font-extrabold transition cursor-pointer whitespace-nowrap ${
                      selectedDayFilter === filterObj.dateString
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : (isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100')
                    }`}
                  >
                    Day {filterObj.dayNumber}
                  </button>
                ))}
              </div>
            </div>

            {/* Right Action Buttons */}
            <div className="pointer-events-auto flex items-center space-x-2 shrink-0">
              {/* GPX Export Button */}
              <button
                onClick={handleDownloadGPX}
                className={`h-10 w-10 rounded-full backdrop-blur-md border flex items-center justify-center opacity-70 hover:opacity-100 transition-all hover:scale-105 active:scale-95 shadow-lg cursor-pointer ${
                  isDark ? 'bg-slate-900/70 text-white border-slate-800 hover:bg-slate-800' : 'bg-white/70 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                }`}
                title="Download GPX Route"
              >
                <Download className={`h-4.5 w-4.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`} />
              </button>

              {/* Copy Summary */}
              <button
                onClick={handleCopyRouteSummary}
                className={`h-10 w-10 rounded-full backdrop-blur-md border flex items-center justify-center opacity-70 hover:opacity-100 transition-all hover:scale-105 active:scale-95 shadow-lg cursor-pointer ${
                  isDark ? 'bg-slate-900/70 text-white border-slate-800 hover:bg-slate-800' : 'bg-white/70 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                }`}
                title="Copy Route Itinerary"
              >
                <Share2 className={`h-4.5 w-4.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`} />
              </button>

              {/* Close Modal Button */}
              <button
                onClick={onClose}
                className={`h-10 w-10 rounded-full backdrop-blur-md border flex items-center justify-center opacity-70 hover:opacity-100 transition-all hover:scale-105 active:scale-95 shadow-lg cursor-pointer ${
                  isDark ? 'bg-slate-900/70 text-white border-slate-800 hover:bg-slate-800' : 'bg-white/70 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                }`}
                title="Close Map"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* Leaflet Canvas Element */}
        <div ref={mapContainerRef} className="w-full h-full z-0 outline-none" />

        {/* Floating Zoom & Layers Controls (Vertical stack like select on map) */}
        <div className={`absolute bottom-48 right-4 z-30 flex flex-col items-center backdrop-blur-md border rounded-2xl p-1 shadow-2xl space-y-1 transition-all ${
          isDark ? 'bg-slate-900/95 border-slate-800/90 text-slate-200' : 'bg-white/95 border-slate-200/90 text-slate-700'
        }`}>
          <button
            type="button"
            onClick={() => mapInstanceRef.current?.zoomIn()}
            className={`h-8 w-8 rounded-xl flex items-center justify-center transition active:scale-95 cursor-pointer ${
              isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'
            }`}
            title="Zoom In"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => mapInstanceRef.current?.zoomOut()}
            className={`h-8 w-8 rounded-xl flex items-center justify-center transition active:scale-95 cursor-pointer ${
              isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'
            }`}
            title="Zoom Out"
          >
            <Minus className="h-4 w-4" />
          </button>

          <div className={`w-5 h-px my-0.5 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowStylePicker(!showStylePicker)}
              className={`h-8 w-8 rounded-xl flex items-center justify-center transition active:scale-95 cursor-pointer ${
                isDark ? 'text-indigo-400 hover:bg-indigo-950/50' : 'text-indigo-600 hover:bg-indigo-50'
              }`}
              title="Map Tile Style"
            >
              <Layers className="h-4 w-4" />
            </button>

            {showStylePicker && (
              <div className={`absolute right-10 bottom-0 backdrop-blur-xl border rounded-2xl p-2 w-44 shadow-2xl z-40 space-y-1 ${
                isDark ? 'bg-slate-900/95 border-slate-800 text-slate-100' : 'bg-white/95 border-slate-200 text-slate-900'
              }`}>
                <div className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Map Style
                </div>
                {Object.entries(TILE_LAYERS).map(([key, style], sIdx) => (
                  <button
                    key={`map-style-${key}-${sIdx}`}
                    type="button"
                    onClick={() => {
                      setActiveTileStyle(key as MapTileStyle);
                      setShowStylePicker(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                      activeTileStyle === key
                        ? 'bg-indigo-600 text-white'
                        : (isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100')
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

        {/* Floating Route Distance HUD Header */}
        {!isSingleStopMode && (
          <div className="absolute top-18 left-4 z-10 pointer-events-none hidden sm:block">
            <div className={`backdrop-blur-md border px-3.5 py-2 rounded-2xl shadow-2xl flex items-center space-x-3 pointer-events-auto ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white/95 border-slate-200'
            }`}>
              <div className={`flex items-center space-x-1.5 font-black text-xs ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                <Gauge className="h-4 w-4" />
                <span>{routePoints.totalDistanceKm.toLocaleString()} km</span>
                <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>({routePoints.totalDistanceMiles.toLocaleString()} mi)</span>
              </div>
              <span className={isDark ? 'text-slate-700' : 'text-slate-300'}>|</span>
              <div className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {validTimeline.length} Stops
              </div>
            </div>
          </div>
        )}

        {/* Single Stop Details Overlay Card (Top centered) */}
        {isSingleStopMode && focusedPlace && (
          <div className="absolute top-[max(env(safe-area-inset-top,0px)+0.5rem,1.75rem)] left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-sm pointer-events-auto">
            <div className={`backdrop-blur-xl border p-3 rounded-2xl shadow-2xl space-y-2 text-left ${
              isDark ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-slate-200/90'
            }`}>
              {/* Header with Type, Google Maps Link, and Close Button */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-1.5 min-w-0">
                  {focusedPlace.isTransportation || focusedPlace.isTransport ? (
                    <Plane className={`h-3.5 w-3.5 shrink-0 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
                  ) : (
                    <MapPin className={`h-3.5 w-3.5 shrink-0 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
                  )}
                  <span className={`text-[10px] font-extrabold uppercase tracking-wide truncate ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                    {focusedPlace.isTransportation || focusedPlace.isTransport ? 'Transport' : 'Stop Location'}
                    {focusedPlace.time ? ` • ${focusedPlace.time.replace('T', ' ')}` : ''}
                  </span>
                </div>

                <div className="flex items-center space-x-1.5 shrink-0">
                  <button
                    onClick={() => setShowFullTripOverride(true)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-extrabold flex items-center space-x-1 transition cursor-pointer shadow-sm border ${
                      isDark
                        ? 'bg-slate-800 hover:bg-slate-700 text-indigo-300 border-slate-700'
                        : 'bg-slate-100 hover:bg-slate-200 text-indigo-700 border-slate-200'
                    }`}
                    title="View full trip map with all stops"
                  >
                    <Route className="h-3 w-3" />
                    <span className="hidden xs:inline">All Stops</span>
                  </button>

                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(focusedPlace.address || focusedPlace.title)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-extrabold flex items-center space-x-1 transition cursor-pointer shadow-sm"
                  >
                    <span>Directions</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>

                  <button
                    onClick={onClose}
                    className={`h-7 w-7 rounded-lg flex items-center justify-center transition cursor-pointer border shadow-sm ${
                      isDark
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700/80'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-200'
                    }`}
                    title="Close map view"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Title & Address */}
              <div>
                <h3 className={`font-extrabold text-sm leading-tight truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{focusedPlace.title}</h3>
                {focusedPlace.address && (
                  <p className={`text-[11px] truncate mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{focusedPlace.address}</p>
                )}
              </div>

              {/* Description if present (skip for transport places where route info is displayed) */}
              {focusedPlace.description && !focusedPlace.isTransport && !focusedPlace.isTransportation && !(focusedPlace.from || focusedPlace.to) && (
                <p className={`text-[11px] leading-snug p-2 rounded-lg border line-clamp-2 ${
                  isDark ? 'text-slate-300 bg-slate-800/40 border-slate-800/80' : 'text-slate-700 bg-slate-50 border-slate-200/80'
                }`}>
                  {focusedPlace.description}
                </p>
              )}

              {/* From / To if present */}
              {(focusedPlace.from || focusedPlace.to) && (
                <div className={`flex items-center space-x-2 text-[11px] px-2.5 py-1.5 rounded-lg border ${
                  isDark ? 'bg-slate-800/40 border-slate-800/50' : 'bg-slate-50 border-slate-200/80'
                }`}>
                  <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Route:</span>
                  <span className={`font-bold truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{focusedPlace.from || 'Origin'}</span>
                  <ArrowRight className={`h-3 w-3 shrink-0 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
                  <span className={`font-bold truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{focusedPlace.to || 'Destination'}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Interactive Journey Simulation & Stops Slidable Bottom Container */}
        {!isSingleStopMode && routePoints.points.length > 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[95%] max-w-xl pointer-events-auto transition-all duration-300">
            <div className={`backdrop-blur-xl border rounded-[2rem] shadow-2xl overflow-hidden transition-all duration-300 ${
              isDark ? 'bg-slate-900/95 border-slate-800 text-slate-100' : 'bg-white/95 border-slate-200/90 text-slate-900'
            }`}>
              
              {/* Top Handle Bar & Toggle Click Area */}
              <div 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="pt-2.5 pb-1 px-4 cursor-pointer hover:bg-slate-500/5 transition flex flex-col items-center select-none"
                title={sidebarOpen ? "Collapse Stops List" : "Expand Stops List"}
              >
                <div className={`w-10 h-1 rounded-full mb-1 transition-colors ${
                  isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-300 hover:bg-slate-400'
                }`} />
              </div>

              {/* Main Controls Section (Always Visible) */}
              <div className="px-4 pb-3.5 space-y-2.5">
                {/* HUD Header info: Step info & Current Stop */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2 min-w-0">
                    <span className={`px-2 py-0.5 rounded-md font-black text-[10px] shrink-0 ${
                      isDark ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                    }`}>
                      Step {playbackIndex + 1} of {routePoints.points.length}
                    </span>
                    <span className={`font-bold truncate max-w-[200px] sm:max-w-[280px] ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {currentScrubPoint ? currentScrubPoint.place.title : 'Journey Overview'}
                    </span>
                  </div>

                  <div className={`text-[10px] font-mono shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {currentScrubPoint?.legDistanceKm ? `+${currentScrubPoint.legDistanceKm} km leg` : ''}
                  </div>
                </div>

                {/* Interactive Timeline Progress Scrub Bar */}
                <div className={`relative w-full h-2 rounded-full overflow-hidden cursor-pointer ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-teal-400 transition-all duration-200"
                    style={{
                      width: `${((playbackIndex + 1) / routePoints.points.length) * 100}%`,
                    }}
                  />
                </div>

                {/* Player Controls Bar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="h-8 w-8 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition active:scale-95 cursor-pointer shadow-md"
                      title={isPlaying ? 'Pause Journey' : 'Play Journey'}
                    >
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                    </button>

                    <button
                      onClick={() => handleScrubPlayback(0)}
                      className={`h-8 w-8 rounded-full flex items-center justify-center transition active:scale-95 cursor-pointer ${
                        isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                      title="Reset to Start"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>

                    <button
                      onClick={() => setPlaybackSpeed(playbackSpeed === 1 ? 2 : playbackSpeed === 2 ? 4 : 1)}
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-black transition cursor-pointer ${
                        isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                      title="Change Playback Speed"
                    >
                      {playbackSpeed}x
                    </button>
                  </div>

                  {/* Expand / Collapse Stops Button */}
                  <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      sidebarOpen
                        ? 'bg-indigo-600 text-white'
                        : (isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-800')
                    }`}
                  >
                    <Compass className="h-3.5 w-3.5" />
                    <span>{sidebarOpen ? 'Hide Stops' : `Stops (${validTimeline.length})`}</span>
                    {sidebarOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Expanded Stops List (Revealed when sidebarOpen is true) */}
              <AnimatePresence>
                {sidebarOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                    className={`border-t overflow-hidden ${
                      isDark ? 'border-slate-800/80 bg-slate-900/60' : 'border-slate-200/80 bg-slate-50/60'
                    }`}
                  >
                    <div className="p-3 space-y-2 max-h-[45vh] overflow-y-auto">
                      {validTimeline.length === 0 ? (
                        <div className="text-center py-6 px-4">
                          <Map className={`h-6 w-6 mx-auto mb-1 ${isDark ? 'text-slate-700' : 'text-slate-300'}`} />
                          <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No geo-tagged stops found for this trip.</p>
                        </div>
                      ) : (
                        validTimeline.map((place, i) => {
                          const isSelected = selectedPlaceId === place.id;
                          const isTransport = place.isTransportation || place.isTransport;
                          const pointData = routePoints.points.find(pt => pt.place.id === place.id);

                          return (
                            <button
                              key={`map-place-${place.id || 'noid'}-${i}`}
                              onClick={() => {
                                handleSelectPlace(place);
                                const ptIdx = routePoints.points.findIndex(pt => pt.place.id === place.id);
                                if (ptIdx !== -1) {
                                  handleScrubPlayback(ptIdx);
                                }
                              }}
                              className={`w-full text-left p-2.5 rounded-2xl border transition-all flex items-start gap-2.5 cursor-pointer ${
                                isSelected
                                  ? (isDark ? 'bg-indigo-950/70 border-indigo-500 shadow-lg' : 'bg-indigo-50 border-indigo-500 shadow-md')
                                  : (isDark ? 'bg-slate-850 hover:bg-slate-800 border-slate-800' : 'bg-white hover:bg-slate-100 border-slate-200/80')
                              }`}
                            >
                              <span className={`h-6 w-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 mt-0.5 border ${
                                isDark ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-slate-100 text-slate-800 border-slate-300'
                              }`}>
                                {i + 1}
                              </span>

                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  {isTransport ? (
                                    <Plane className={`h-3.5 w-3.5 shrink-0 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
                                  ) : (
                                    <MapPin className={`h-3.5 w-3.5 shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                                  )}
                                  <span className={`text-xs font-bold truncate block ${
                                    isSelected
                                      ? (isDark ? 'text-indigo-300' : 'text-indigo-700')
                                      : (isDark ? 'text-slate-100' : 'text-slate-800')
                                  }`}>
                                    {place.title}
                                  </span>
                                </div>

                                {place.time && (
                                  <span className={`text-[10px] font-mono block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    {place.time.replace('T', ' ')}
                                  </span>
                                )}

                                {pointData && pointData.legDistanceKm > 0 && (
                                  <div className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[9.5px] font-bold ${
                                    isDark ? 'bg-slate-800 text-indigo-400' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                  }`}>
                                    <span>+{pointData.legDistanceKm} km from prev stop</span>
                                  </div>
                                )}
                              </div>

                              <ChevronRight className={`h-4 w-4 mt-1 self-center shrink-0 transition-transform ${
                                isSelected
                                  ? (isDark ? 'translate-x-1 text-indigo-400' : 'translate-x-1 text-indigo-600')
                                  : (isDark ? 'text-slate-500' : 'text-slate-400')
                              }`} />
                            </button>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
}


import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Check, MapPin, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useBackButton } from '../lib/backButtonHandler';
import { Place, ColorTheme } from '../types';

interface WeatherStopBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  timeline: Place[];
  destinationName: string;
  selectedStopId: string;
  onSelectStop: (stopId: string) => void;
}

const getAccentThemeClasses = (theme: ColorTheme) => {
  switch (theme) {
    case 'ocean':
      return {
        focusRing: 'focus-within:border-[#3661b6]',
        headerIconBg: 'bg-[#3661b6]/10 text-[#3661b6] dark:bg-[#3661b6]/20 dark:text-[#3661b6]',
        selectedBadge: 'bg-[#3661b6] text-white shadow-sm',
        selectedRow: 'bg-[#3661b6]/10 dark:bg-[#3661b6]/20 text-[#3661b6] dark:text-[#5a83d4] font-bold border border-[#3661b6]/30 dark:border-[#3661b6]/40',
        checkCircle: 'bg-[#3661b6] text-white',
      };
    case 'teal':
      return {
        focusRing: 'focus-within:border-[#4bc0b0]',
        headerIconBg: 'bg-[#4bc0b0]/10 text-[#4bc0b0] dark:bg-[#4bc0b0]/20 dark:text-[#4bc0b0]',
        selectedBadge: 'bg-[#4bc0b0] text-white shadow-sm',
        selectedRow: 'bg-[#4bc0b0]/10 dark:bg-[#4bc0b0]/20 text-[#28867a] dark:text-[#67d5c7] font-bold border border-[#4bc0b0]/30 dark:border-[#4bc0b0]/40',
        checkCircle: 'bg-[#4bc0b0] text-white',
      };
    case 'rose':
      return {
        focusRing: 'focus-within:border-rose-500',
        headerIconBg: 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400',
        selectedBadge: 'bg-rose-600 text-white shadow-sm',
        selectedRow: 'bg-rose-50/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold border border-rose-200/80 dark:border-rose-800/60',
        checkCircle: 'bg-rose-600 text-white',
      };
    case 'monalisa':
      return {
        focusRing: 'focus-within:border-[#EA9489]',
        headerIconBg: 'bg-[#EA9489]/10 text-[#d87063] dark:bg-[#EA9489]/20 dark:text-[#EA9489]',
        selectedBadge: 'bg-[#EA9489] text-white shadow-sm',
        selectedRow: 'bg-[#EA9489]/10 dark:bg-[#EA9489]/20 text-[#c2584b] dark:text-[#f2afa7] font-bold border border-[#EA9489]/30 dark:border-[#EA9489]/40',
        checkCircle: 'bg-[#EA9489] text-white',
      };
    case 'bright-lilac':
      return {
        focusRing: 'focus-within:border-[#CB96EC]',
        headerIconBg: 'bg-[#CB96EC]/10 text-[#a85ee3] dark:bg-[#CB96EC]/20 dark:text-[#CB96EC]',
        selectedBadge: 'bg-[#CB96EC] text-white shadow-sm',
        selectedRow: 'bg-[#CB96EC]/10 dark:bg-[#CB96EC]/20 text-[#8e3ecf] dark:text-[#dab0f3] font-bold border border-[#CB96EC]/30 dark:border-[#CB96EC]/40',
        checkCircle: 'bg-[#CB96EC] text-white',
      };
    case 'persian-pink':
      return {
        focusRing: 'focus-within:border-[#EB8AC9]',
        headerIconBg: 'bg-[#EB8AC9]/10 text-[#d956a9] dark:bg-[#EB8AC9]/20 dark:text-[#EB8AC9]',
        selectedBadge: 'bg-[#EB8AC9] text-white shadow-sm',
        selectedRow: 'bg-[#EB8AC9]/10 dark:bg-[#EB8AC9]/20 text-[#c73993] dark:text-[#f0a9d7] font-bold border border-[#EB8AC9]/30 dark:border-[#EB8AC9]/40',
        checkCircle: 'bg-[#EB8AC9] text-white',
      };
    case 'indigo':
    default:
      return {
        focusRing: 'focus-within:border-indigo-500',
        headerIconBg: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400',
        selectedBadge: 'bg-indigo-600 text-white shadow-sm',
        selectedRow: 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200/80 dark:border-indigo-800/60',
        checkCircle: 'bg-indigo-600 text-white',
      };
  }
};

export const WeatherStopBottomSheet: React.FC<WeatherStopBottomSheetProps> = ({
  isOpen,
  onClose,
  timeline,
  destinationName,
  selectedStopId,
  onSelectStop,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAccentTheme, setActiveAccentTheme] = useState<ColorTheme>(
    () => (localStorage.getItem('color-theme') as ColorTheme) || 'indigo'
  );

  useEffect(() => {
    const handleThemeChange = () => {
      const stored = (localStorage.getItem('color-theme') as ColorTheme) || 'indigo';
      setActiveAccentTheme(stored);
    };

    window.addEventListener('storage', handleThemeChange);
    return () => window.removeEventListener('storage', handleThemeChange);
  }, []);

  useBackButton('weather-stop-bottom-sheet', isOpen, onClose, 200);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  const filteredStops = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return timeline;
    return timeline.filter(
      (p) =>
        (p.title && p.title.toLowerCase().includes(q)) ||
        (p.address && p.address.toLowerCase().includes(q)) ||
        (p.stayAddress && p.stayAddress.toLowerCase().includes(q)) ||
        (p.time && p.time.toLowerCase().includes(q))
    );
  }, [timeline, searchQuery]);

  const showDestinationOption = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return destinationName.toLowerCase().includes(q);
  }, [destinationName, searchQuery]);

  const accent = useMemo(() => getAccentThemeClasses(activeAccentTheme), [activeAccentTheme]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center pointer-events-auto">
          {/* Dimmed Scrim Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
          />

          {/* Modal Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="relative z-10 w-full max-w-lg bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-[32px] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-left"
          >
            {/* Drag Handle */}
            <div className="w-full flex items-center justify-center pt-3 pb-1">
              <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>

            {/* Header */}
            <div className="px-5 sm:px-6 pt-2 pb-3 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center space-x-2.5">
                <div className={`p-2 rounded-xl ${accent.headerIconBg}`}>
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight">
                    Select Weather Location
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Check forecast for destination or timeline stops
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search Input (No Auto-Focus) */}
            <div className="p-4 sm:p-5 pb-2">
              <div className={`relative flex items-center bg-slate-100 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl px-3.5 py-2.5 ${accent.focusRing} transition shadow-inner`}>
                <Search className="h-4 w-4 text-slate-400 shrink-0 mr-2" />
                <input
                  type="text"
                  placeholder="Search stop name, city, or date..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs bg-transparent outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 font-medium"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Stop List */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-5 pb-8 space-y-1.5 divide-y divide-slate-100 dark:divide-slate-800/40">
              {/* Destination Entry */}
              {showDestinationOption && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectStop('destination');
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl text-left transition cursor-pointer ${
                    selectedStopId === 'destination'
                      ? accent.selectedRow
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono text-xs font-black shrink-0 transition-colors ${
                        selectedStopId === 'destination'
                          ? accent.selectedBadge
                          : 'bg-slate-150 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      📍
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-extrabold text-xs sm:text-sm tracking-tight">
                          Trip Destination
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {destinationName}
                      </p>
                    </div>
                  </div>

                  {selectedStopId === 'destination' && (
                    <div className={`h-6 w-6 rounded-full ${accent.checkCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                      <Check className="h-3.5 w-3.5" />
                    </div>
                  )}
                </button>
              )}

              {/* Timeline Stops */}
              {filteredStops.length === 0 && !showDestinationOption ? (
                <div className="py-10 text-center text-slate-400 dark:text-slate-500 text-xs">
                  No stops matching "{searchQuery}"
                </div>
              ) : (
                filteredStops.map((stop, idx) => {
                  const isSelected = selectedStopId === stop.id;
                  const dateStr = stop.time ? stop.time.split('T')[0] : '';
                  const timeStr = stop.time && stop.time.includes('T') ? stop.time.split('T')[1].slice(0, 5) : '';

                  return (
                    <button
                      key={stop.id || idx}
                      type="button"
                      onClick={() => {
                        onSelectStop(stop.id);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl text-left transition cursor-pointer ${
                        isSelected
                          ? accent.selectedRow
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono text-xs font-black shrink-0 transition-colors ${
                            isSelected
                              ? accent.selectedBadge
                              : 'bg-slate-150 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          #{idx + 1}
                        </div>

                        <div className="min-w-0">
                          <span className="font-extrabold text-xs sm:text-sm tracking-tight block truncate">
                            {stop.title || 'Untitled Stop'}
                          </span>
                          <div className="flex items-center space-x-2 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {dateStr && (
                              <span className="flex items-center space-x-1 font-mono">
                                <Clock className="h-3 w-3" />
                                <span>{dateStr} {timeStr}</span>
                              </span>
                            )}
                            {stop.address && (
                              <span className="truncate max-w-[140px] text-slate-400">
                                • {stop.address}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <div className={`h-6 w-6 rounded-full ${accent.checkCircle} flex items-center justify-center shrink-0 shadow-xs`}>
                          <Check className="h-3.5 w-3.5" />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
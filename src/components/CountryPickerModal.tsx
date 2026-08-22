import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Globe, Search, X, Check, Trash2, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { StaticCurrency } from '../data/staticCurrencies';
import { useBackButton } from '../lib/backButtonHandler';
import { ColorTheme } from '../types';

interface CountryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSelectedCountries: string;
  currenciesList: StaticCurrency[];
  onConfirm: (selectedCountries: string[]) => void;
}

const getAccentClasses = (theme: ColorTheme) => {
  switch (theme) {
    case 'ocean':
      return {
        focusRing: 'focus-within:border-[#3661b6]',
        iconBg: 'bg-[#3661b6]/10 text-[#3661b6] dark:bg-[#3661b6]/20 dark:text-[#3661b6]',
        badge: 'bg-[#3661b6] text-white',
        selectedRow: 'bg-[#3661b6]/10 dark:bg-[#3661b6]/20 text-[#3661b6] dark:text-[#5a83d4] border-[#3661b6]/40',
        checkBtn: 'bg-[#3661b6] text-white',
        confirmBtn: 'bg-[#3661b6] hover:bg-[#2c5199] text-white',
        tagBg: 'bg-[#3661b6]/15 text-[#3661b6] dark:text-[#7ba5f5] border-[#3661b6]/30',
      };
    case 'teal':
      return {
        focusRing: 'focus-within:border-[#4bc0b0]',
        iconBg: 'bg-[#4bc0b0]/10 text-[#4bc0b0] dark:bg-[#4bc0b0]/20 dark:text-[#4bc0b0]',
        badge: 'bg-[#4bc0b0] text-white',
        selectedRow: 'bg-[#4bc0b0]/10 dark:bg-[#4bc0b0]/20 text-[#28867a] dark:text-[#67d5c7] border-[#4bc0b0]/40',
        checkBtn: 'bg-[#4bc0b0] text-white',
        confirmBtn: 'bg-[#4bc0b0] hover:bg-[#3ba899] text-white',
        tagBg: 'bg-[#4bc0b0]/15 text-[#28867a] dark:text-[#67d5c7] border-[#4bc0b0]/30',
      };
    case 'rose':
      return {
        focusRing: 'focus-within:border-rose-500',
        iconBg: 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400',
        badge: 'bg-rose-600 text-white',
        selectedRow: 'bg-rose-50/90 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800',
        checkBtn: 'bg-rose-600 text-white',
        confirmBtn: 'bg-rose-600 hover:bg-rose-700 text-white',
        tagBg: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
      };
    case 'monalisa':
      return {
        focusRing: 'focus-within:border-[#EA9489]',
        iconBg: 'bg-[#EA9489]/10 text-[#d87063] dark:bg-[#EA9489]/20 dark:text-[#EA9489]',
        badge: 'bg-[#EA9489] text-white',
        selectedRow: 'bg-[#EA9489]/15 dark:bg-[#EA9489]/20 text-[#c2584b] dark:text-[#f2afa7] border-[#EA9489]/40',
        checkBtn: 'bg-[#EA9489] text-white',
        confirmBtn: 'bg-[#EA9489] hover:bg-[#d87063] text-white',
        tagBg: 'bg-[#EA9489]/15 text-[#c2584b] dark:text-[#f2afa7] border-[#EA9489]/30',
      };
    case 'bright-lilac':
      return {
        focusRing: 'focus-within:border-[#CB96EC]',
        iconBg: 'bg-[#CB96EC]/10 text-[#a85ee3] dark:bg-[#CB96EC]/20 dark:text-[#CB96EC]',
        badge: 'bg-[#CB96EC] text-white',
        selectedRow: 'bg-[#CB96EC]/15 dark:bg-[#CB96EC]/20 text-[#8e3ecf] dark:text-[#dab0f3] border-[#CB96EC]/40',
        checkBtn: 'bg-[#CB96EC] text-white',
        confirmBtn: 'bg-[#CB96EC] hover:bg-[#b576dd] text-white',
        tagBg: 'bg-[#CB96EC]/15 text-[#8e3ecf] dark:text-[#dab0f3] border-[#CB96EC]/30',
      };
    case 'persian-pink':
      return {
        focusRing: 'focus-within:border-[#EB8AC9]',
        iconBg: 'bg-[#EB8AC9]/10 text-[#d956a9] dark:bg-[#EB8AC9]/20 dark:text-[#EB8AC9]',
        badge: 'bg-[#EB8AC9] text-white',
        selectedRow: 'bg-[#EB8AC9]/15 dark:bg-[#EB8AC9]/20 text-[#c73993] dark:text-[#f0a9d7] border-[#EB8AC9]/40',
        checkBtn: 'bg-[#EB8AC9] text-white',
        confirmBtn: 'bg-[#EB8AC9] hover:bg-[#d956a9] text-white',
        tagBg: 'bg-[#EB8AC9]/15 text-[#c73993] dark:text-[#f0a9d7] border-[#EB8AC9]/30',
      };
    case 'indigo':
    default:
      return {
        focusRing: 'focus-within:border-indigo-500',
        iconBg: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400',
        badge: 'bg-indigo-600 text-white',
        selectedRow: 'bg-indigo-50/90 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
        checkBtn: 'bg-indigo-600 text-white',
        confirmBtn: 'bg-indigo-600 hover:bg-indigo-700 text-white',
        tagBg: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
      };
  }
};

export default function CountryPickerModal({
  isOpen,
  onClose,
  initialSelectedCountries,
  currenciesList,
  onConfirm,
}: CountryPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegionTab, setSelectedRegionTab] = useState<string>('ALL');

  const [activeTheme, setActiveTheme] = useState<ColorTheme>(
    () => (localStorage.getItem('color-theme') as ColorTheme) || 'indigo'
  );

  useEffect(() => {
    const handleStorage = () => {
      const stored = (localStorage.getItem('color-theme') as ColorTheme) || 'indigo';
      setActiveTheme(stored);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const accent = useMemo(() => getAccentClasses(activeTheme), [activeTheme]);

  useBackButton('country-picker-bottom-sheet', isOpen, onClose, 200);

  const initialSelectedList = useMemo(() => {
    return initialSelectedCountries
      ? initialSelectedCountries.split(',').map((c) => c.trim()).filter(Boolean)
      : [];
  }, [initialSelectedCountries]);

  const [tempSelected, setTempSelected] = useState<string[]>(initialSelectedList);

  useEffect(() => {
    if (isOpen) {
      setTempSelected(initialSelectedList);
      setSearchQuery('');
      setSelectedRegionTab('ALL');
    }
  }, [isOpen, initialSelectedCountries]);

  const regionList = useMemo(() => {
    const regions = new Set<string>();
    currenciesList.forEach((c) => {
      if (c.region) regions.add(c.region);
    });
    return Array.from(regions).sort((a, b) => a.localeCompare(b));
  }, [currenciesList]);

  const uniqueCountries = useMemo(() => {
    const map = new Map<string, StaticCurrency>();
    currenciesList.forEach((c) => {
      if (!map.has(c.countryName)) {
        map.set(c.countryName, c);
      }
    });
    return Array.from(map.values());
  }, [currenciesList]);

  const filteredCountries = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return uniqueCountries
      .filter((c) => {
        if (selectedRegionTab !== 'ALL' && c.region !== selectedRegionTab) {
          return false;
        }
        if (query) {
          const matchName = c.countryName.toLowerCase().includes(query);
          const matchRegion = c.region && c.region.toLowerCase().includes(query);
          const matchCurrency = c.currencyCode.toLowerCase().includes(query);
          return matchName || matchRegion || matchCurrency;
        }
        return true;
      })
      .sort((a, b) => a.countryName.localeCompare(b.countryName));
  }, [uniqueCountries, selectedRegionTab, searchQuery]);

  const handleToggleCountry = (countryName: string) => {
    if (tempSelected.includes(countryName)) {
      setTempSelected(tempSelected.filter((c) => c !== countryName));
    } else {
      setTempSelected([...tempSelected, countryName]);
    }
  };

  const handleRemoveChip = (countryName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTempSelected(tempSelected.filter((c) => c !== countryName));
  };

  const handleClearAll = () => {
    setTempSelected([]);
  };

  const handleResetFilters = () => {
    setSelectedRegionTab('ALL');
    setSearchQuery('');
  };

  const handleConfirm = () => {
    onConfirm(tempSelected);
    onClose();
  };

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

          {/* Bottom Sheet Container */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="relative z-10 w-full max-w-2xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-[32px] shadow-2xl flex flex-col max-h-[88vh] overflow-hidden text-left"
          >
            {/* Drag Handle */}
            <div className="w-full flex items-center justify-center pt-3 pb-1">
              <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>

            {/* Header */}
            <div className="px-5 sm:px-6 pt-2 pb-3 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 shrink-0">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className={`p-2 rounded-xl ${accent.iconBg} shrink-0`}>
                  <Globe className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                      Select Destination
                    </h3>
                    {tempSelected.length > 0 && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${accent.badge} shrink-0`}>
                        {tempSelected.length}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                    Pick all countries you will explore on this journey
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

            {/* Selected Countries Horizontal Tag Strip */}
            {tempSelected.length > 0 && (
              <div className="px-5 py-2.5 bg-slate-50/80 dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-800/50 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
                {tempSelected.map((name) => {
                  const countryObj = uniqueCountries.find((c) => c.countryName === name);
                  return (
                    <div
                      key={`selected-chip-${name}`}
                      className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border ${accent.tagBg} shadow-3xs shrink-0 animate-in fade-in zoom-in-95 duration-100`}
                    >
                      <span className="text-sm leading-none">{countryObj?.flagEmoji || '🌍'}</span>
                      <span className="truncate max-w-[110px]">{name}</span>
                      <button
                        type="button"
                        onClick={(e) => handleRemoveChip(name, e)}
                        className="p-0.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Search Input Bar (No Auto-Focus) */}
            <div className="px-5 pt-3 pb-2 space-y-2.5 shrink-0">
              <div className={`relative flex items-center bg-slate-100 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl px-3.5 py-2 ${accent.focusRing} transition shadow-inner`}>
                <Search className="h-4 w-4 text-slate-400 shrink-0 mr-2" />
                <input
                  type="text"
                  placeholder="Search country, continent, or currency (e.g. Japan, Europe, JPY)..."
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

              {/* Continent Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedRegionTab('ALL')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all shrink-0 cursor-pointer ${
                    selectedRegionTab === 'ALL'
                      ? `${accent.badge} shadow-xs`
                      : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  All ({uniqueCountries.length})
                </button>

                {regionList.map((region) => {
                  const count = uniqueCountries.filter((c) => c.region === region).length;
                  const isSelected = selectedRegionTab === region;
                  return (
                    <button
                      key={region}
                      type="button"
                      onClick={() => setSelectedRegionTab(region)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all shrink-0 cursor-pointer ${
                        isSelected
                          ? `${accent.badge} shadow-xs`
                          : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {region} ({count})
                    </button>
                  );
                })}

                {(selectedRegionTab !== 'ALL' || searchQuery !== '') && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline shrink-0 px-2 cursor-pointer"
                  >
                    Reset Filter
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Country Selection List */}
            <div className="flex-1 overflow-y-auto px-5 py-2 space-y-1.5 divide-y divide-slate-100 dark:divide-slate-800/40">
              {filteredCountries.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <Globe className="h-8 w-8 text-slate-300 dark:text-slate-700 mx-auto stroke-1" />
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    No countries found matching "{searchQuery}"
                  </p>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    Clear Search
                  </button>
                </div>
              ) : (
                filteredCountries.map((c) => {
                  const isSelected = tempSelected.includes(c.countryName);
                  return (
                    <button
                      key={c.id || c.countryName}
                      type="button"
                      onClick={() => handleToggleCountry(c.countryName)}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl text-left transition cursor-pointer ${
                        isSelected
                          ? `${accent.selectedRow} font-bold border shadow-xs`
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        {/* Leading Emoji Flag */}
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-white/80 dark:bg-slate-900/80 shadow-xs'
                              : 'bg-slate-100 dark:bg-slate-800'
                          }`}
                        >
                          <span>{c.flagEmoji || '🌍'}</span>
                        </div>

                        {/* Country and Continent */}
                        <div className="min-w-0">
                          <span className="font-extrabold text-xs sm:text-sm tracking-tight block truncate">
                            {c.countryName}
                          </span>
                          <div className="flex items-center space-x-2 text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                            {c.region && <span>{c.region}</span>}
                            <span>•</span>
                            <span className="font-mono font-bold uppercase">{c.currencyCode}</span>
                          </div>
                        </div>
                      </div>

                      {/* Selection Checkmark / Circle */}
                      <div
                        className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 transition-all ${
                          isSelected
                            ? `${accent.checkBtn} shadow-xs scale-105`
                            : 'border-2 border-slate-300 dark:border-slate-700 bg-transparent'
                        }`}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Bottom Action Bar */}
            <div className="px-5 py-3.5 bg-slate-50/95 dark:bg-slate-950/95 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center space-x-2 min-w-0">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
                  {tempSelected.length} {tempSelected.length === 1 ? 'country' : 'countries'} selected
                </span>
                {tempSelected.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-[11px] font-bold text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 underline cursor-pointer shrink-0"
                  >
                    Clear All
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className={`px-5 py-2 ${accent.confirmBtn} font-bold rounded-xl text-xs transition shadow-sm cursor-pointer`}
                >
                  Confirm Selection
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}